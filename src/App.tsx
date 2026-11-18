import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { AppHeader } from './components/AppHeader';
import { FlashcardPanel } from './components/FlashcardPanel';
import { KanjiListPanel } from './components/KanjiListPanel';
import { QuizPanel } from './components/QuizPanel';
import { RestoreModal, type PendingRestoreState } from './components/RestoreModal';
import { Sidebar } from './components/Sidebar';
import { ToastBanner } from './components/ToastBanner';
import { KANJI } from './data/kanjiData';
import {
  OperationType,
  auth,
  db,
  getFirestoreUpgradeUrl,
  googleProvider,
  handleFirestoreError,
  isFirestoreQuotaError,
} from './firebase';
import type { AppTab, LevelFilter, ToastMessage } from './types/kanji';
import {
  areSetsEqual,
  buildUserProgressWriteData,
  mergeProgressSets,
  sanitizeProgressLists,
} from './utils/progressSync';
import { getPoolIndices, shuffled } from './utils/quizEngine';
import {
  HARD_KEY,
  LS_KEY,
  buildBackupPayload,
  clearStoredProgress,
  commitProgressTransaction,
  getStoredOwnerUid,
  safeLoadSet,
  setStoredOwnerUid,
  validateAndParseBackup,
} from './utils/storage';
import { speakJP } from './utils/tts';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('card');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');

  const [mastered, setMastered] = useState<Set<string>>(() => safeLoadSet(LS_KEY));
  const [hardSet, setHardSet] = useState<Set<string>>(() => safeLoadSet(HARD_KEY));

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [hardMode, setHardMode] = useState(false);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [hideMastered, setHideMastered] = useState(false);

  const [order, setOrder] = useState<number[]>(() => getPoolIndices('all', KANJI));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionHard, setSessionHard] = useState<Set<number>>(() => new Set());
  const [sessionNewMaster, setSessionNewMaster] = useState(0);

  const [pendingRestore, setPendingRestore] = useState<PendingRestoreState | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const restoreBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastCounterRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const masteredRef = useRef(mastered);
  masteredRef.current = mastered;
  const hardRef = useRef(hardSet);
  hardRef.current = hardSet;
  const cloudDocExistsRef = useRef(false);
  const justSignedInRef = useRef(false);

  if (fatalError) {
    throw fatalError;
  }

  const showToast = useCallback(
    (tone: ToastMessage['tone'], title: string, detail?: string) => {
      toastCounterRef.current += 1;
      const id = toastCounterRef.current;
      setToast({ id, tone, title, detail });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToast(prev => (prev?.id === id ? null : prev));
      }, 6500);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const reportFirestoreFailure = useCallback(
    (err: unknown, op: OperationType, path: string) => {
      if (isFirestoreQuotaError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        const detail = msg.includes('Free daily read units per project')
          ? `Kuota baca harian gratis Firestore habis. Upgrade database: ${getFirestoreUpgradeUrl()}`
          : 'Kuota harian gratis Firestore tercapai dan akan direset besok. Progres tetap tersimpan di perangkat ini.';
        showToast('warning', 'Batas Kuota Cloud Tercapai', detail);
        return;
      }

      try {
        handleFirestoreError(err, op, path);
      } catch (wrapped) {
        const errorObj = wrapped instanceof Error ? wrapped : new Error(String(wrapped));
        const raw = err instanceof Error ? err.message : String(err);
        if (raw.includes('Missing or insufficient permissions') || raw.includes('permission-denied')) {
          setFatalError(errorObj);
        } else {
          showToast(
            'warning',
            'Sinkronisasi Cloud Tertunda',
            'Progres tersimpan di perangkat ini. Perubahan akan tersinkronkan saat koneksi stabil.'
          );
        }
      }
    },
    [showToast]
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore initial sync + real-time listener (attached only when auth is ready & user authenticated)
  useEffect(() => {
    if (!authReady || !user) {
      cloudDocExistsRef.current = false;
      setSyncing(false);
      return;
    }

    let cancelled = false;
    let unsubSnapshot: (() => void) | null = null;
    const uid = user.uid;
    const docPath = `users/${uid}`;
    const userDocRef = doc(db, 'users', uid);

    const bootstrapCloudSync = async () => {
      setSyncing(true);
      try {
        const snap = await getDoc(userDocRef);
        if (cancelled) return;

        const storedOwner = getStoredOwnerUid();
        const canMergeLocal = storedOwner === null || storedOwner === uid;
        const localM = canMergeLocal ? masteredRef.current : new Set<string>();
        const localH = canMergeLocal ? hardRef.current : new Set<string>();

        if (!snap.exists()) {
          cloudDocExistsRef.current = false;
          const payload = buildUserProgressWriteData(uid, localM, localH);
          try {
            await setDoc(userDocRef, {
              ...payload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            if (cancelled) return;
            cloudDocExistsRef.current = true;
          } catch (writeErr) {
            if (!cancelled) reportFirestoreFailure(writeErr, OperationType.CREATE, docPath);
            return;
          }

          const cleanLocalM = new Set(payload.mastered);
          const cleanLocalH = new Set(payload.hard);
          commitProgressTransaction(cleanLocalM, cleanLocalH);
          setStoredOwnerUid(uid);
          setMastered(cleanLocalM);
          setHardSet(cleanLocalH);

          if (justSignedInRef.current) {
            showToast(
              'success',
              'Login Google Berhasil',
              cleanLocalM.size > 0
                ? `${cleanLocalM.size} kanji hafal disinkronkan ke akun Google Anda.`
                : 'Akun Google terhubung. Progres belajar akan tersimpan ke cloud.'
            );
            justSignedInRef.current = false;
          }
        } else {
          cloudDocExistsRef.current = true;
          const data = snap.data() as { mastered?: unknown[]; hard?: unknown[] };
          const cleanCloud = sanitizeProgressLists(
            Array.isArray(data.mastered) ? data.mastered : [],
            Array.isArray(data.hard) ? data.hard : []
          );
          const cloudMSet = new Set(cleanCloud.mastered);
          const cloudHSet = new Set(cleanCloud.hard);

          const merged = mergeProgressSets(cloudMSet, cloudHSet, localM, localH);
          if (merged.addedFromSecondary > 0) {
            const payload = buildUserProgressWriteData(uid, merged.mastered, merged.hard);
            try {
              await updateDoc(userDocRef, {
                mastered: payload.mastered,
                hard: payload.hard,
                updatedAt: serverTimestamp(),
              });
              if (cancelled) return;
            } catch (updateErr) {
              if (!cancelled) reportFirestoreFailure(updateErr, OperationType.UPDATE, docPath);
              return;
            }
            if (justSignedInRef.current) {
              showToast(
                'success',
                'Login & Gabung Progres Berhasil',
                `${merged.addedFromSecondary} progres lokal digabungkan ke akun Google Anda.`
              );
              justSignedInRef.current = false;
            }
          } else if (justSignedInRef.current) {
            showToast(
              'success',
              'Login Google Berhasil',
              `Progres cloud dimuat: ${merged.mastered.size} hafal & ${merged.hard.size} sulit.`
            );
            justSignedInRef.current = false;
          }

          commitProgressTransaction(merged.mastered, merged.hard);
          setStoredOwnerUid(uid);
          setMastered(merged.mastered);
          setHardSet(merged.hard);
        }

        if (cancelled) return;

        unsubSnapshot = onSnapshot(
          userDocRef,
          docSnap => {
            if (cancelled || !docSnap.exists()) return;
            cloudDocExistsRef.current = true;
            const raw = docSnap.data() as { mastered?: unknown[]; hard?: unknown[] };
            const clean = sanitizeProgressLists(
              Array.isArray(raw.mastered) ? raw.mastered : [],
              Array.isArray(raw.hard) ? raw.hard : []
            );
            const nextM = new Set(clean.mastered);
            const nextH = new Set(clean.hard);
            if (!areSetsEqual(nextM, masteredRef.current) || !areSetsEqual(nextH, hardRef.current)) {
              commitProgressTransaction(nextM, nextH);
              setStoredOwnerUid(uid);
              setMastered(nextM);
              setHardSet(nextH);
            }
          },
          snapErr => {
            if (!cancelled) {
              reportFirestoreFailure(snapErr, OperationType.GET, docPath);
            }
          }
        );
      } catch (err) {
        if (!cancelled) {
          reportFirestoreFailure(err, OperationType.GET, docPath);
        }
      } finally {
        if (!cancelled) {
          setSyncing(false);
        }
      }
    };

    void bootstrapCloudSync();

    return () => {
      cancelled = true;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [authReady, user, reportFirestoreFailure, showToast]);

  const computeCardPool = useCallback(
    (
      lv: LevelFilter,
      hideM: boolean,
      onlyH: boolean,
      mSet: Set<string>,
      hSet: Set<string>
    ) => {
      return getPoolIndices(lv, KANJI).filter(
        i => (!hideM || !mSet.has(KANJI[i].id)) && (!onlyH || hSet.has(KANJI[i].id))
      );
    },
    []
  );

  const rebuildOrder = useCallback((indices: number[], shouldShuffle: boolean) => {
    setOrder(shouldShuffle ? shuffled(indices) : indices.slice());
    setPos(0);
    setFlipped(false);
    setSessionHard(new Set());
    setSessionNewMaster(0);
  }, []);

  const levelIndices = useMemo(() => getPoolIndices(levelFilter, KANJI), [levelFilter]);
  const levelMasteredCount = useMemo(
    () => levelIndices.filter(i => mastered.has(KANJI[i].id)).length,
    [levelIndices, mastered]
  );
  const levelHardCount = useMemo(
    () => levelIndices.filter(i => hardSet.has(KANJI[i].id)).length,
    [levelIndices, hardSet]
  );

  const syncProgressToCloud = useCallback(
    async (uid: string, nextMastered: Set<string>, nextHard: Set<string>) => {
      const docPath = `users/${uid}`;
      const userDocRef = doc(db, 'users', uid);
      const payload = buildUserProgressWriteData(uid, nextMastered, nextHard);
      const op = cloudDocExistsRef.current ? OperationType.UPDATE : OperationType.CREATE;
      try {
        if (cloudDocExistsRef.current) {
          await updateDoc(userDocRef, {
            mastered: payload.mastered,
            hard: payload.hard,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(userDocRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          cloudDocExistsRef.current = true;
        }
      } catch (err) {
        reportFirestoreFailure(err, op, docPath);
      }
    },
    [reportFirestoreFailure]
  );

  const applyProgressChange = useCallback(
    (nextMastered: Set<string>, nextHard: Set<string>): boolean => {
      const clean = sanitizeProgressLists(nextMastered, nextHard);
      const cleanM = new Set(clean.mastered);
      const cleanH = new Set(clean.hard);

      const tx = commitProgressTransaction(cleanM, cleanH);
      if (!tx.ok) {
        showToast('error', 'Penyimpanan Gagal', tx.error);
        return false;
      }

      if (user) {
        setStoredOwnerUid(user.uid);
        void syncProgressToCloud(user.uid, cleanM, cleanH);
      }

      setMastered(cleanM);
      setHardSet(cleanH);
      return true;
    },
    [showToast, user, syncProgressToCloud]
  );

  const handleSignIn = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    justSignedInRef.current = true;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      justSignedInRef.current = false;
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        showToast('info', 'Login Dibatalkan', 'Jendela login Google ditutup sebelum selesai.');
      } else if (code === 'auth/popup-blocked') {
        showToast(
          'warning',
          'Popup Diblokir Browser',
          'Izinkan popup untuk situs ini agar bisa masuk dengan Google.'
        );
      } else if (code === 'auth/network-request-failed') {
        showToast('error', 'Koneksi Bermasalah', 'Periksa koneksi internet Anda lalu coba lagi.');
      } else {
        showToast(
          'error',
          'Login Google Gagal',
          err instanceof Error ? err.message : 'Tidak dapat masuk dengan Google saat ini.'
        );
      }
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, showToast]);

  const handleSignOut = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await signOut(auth);
      cloudDocExistsRef.current = false;
      justSignedInRef.current = false;
      clearStoredProgress();
      const emptyM = new Set<string>();
      const emptyH = new Set<string>();
      setMastered(emptyM);
      setHardSet(emptyH);
      const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, emptyM, emptyH);
      rebuildOrder(nextPool, shuffleOn);
      showToast(
        'info',
        'Berhasil Keluar',
        'Progres Anda tetap tersimpan aman di akun Google.'
      );
    } catch (err) {
      showToast(
        'error',
        'Gagal Keluar',
        err instanceof Error ? err.message : 'Tidak dapat keluar dari akun saat ini.'
      );
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, computeCardPool, levelFilter, hideMastered, hardMode, rebuildOrder, shuffleOn, showToast]);

  const handleSelectLevel = useCallback(
    (nextLevel: LevelFilter) => {
      if (nextLevel === levelFilter) return;
      setLevelFilter(nextLevel);
      const nextPool = computeCardPool(nextLevel, hideMastered, hardMode, mastered, hardSet);
      rebuildOrder(nextPool, shuffleOn);
    },
    [levelFilter, computeCardPool, hideMastered, hardMode, mastered, hardSet, rebuildOrder, shuffleOn]
  );

  const handleMarkMastered = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    const nextM = new Set(mastered);
    const nextH = new Set(hardSet);
    const isNew = !nextM.has(item.id);
    nextM.add(item.id);
    nextH.delete(item.id);

    if (!applyProgressChange(nextM, nextH)) return;
    if (isNew) setSessionNewMaster(v => v + 1);
    setPos(p => p + 1);
    setFlipped(false);
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleMarkHard = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    const nextM = new Set(mastered);
    const nextH = new Set(hardSet);
    nextH.add(item.id);

    if (!applyProgressChange(nextM, nextH)) return;
    setSessionHard(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setPos(p => p + 1);
    setFlipped(false);
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleForgetCurrent = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    if (!mastered.has(item.id)) return;
    const nextM = new Set(mastered);
    nextM.delete(item.id);
    applyProgressChange(nextM, new Set(hardSet));
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleResetAllLevelMastered = useCallback(() => {
    const nextM = new Set(mastered);
    levelIndices.forEach(i => nextM.delete(KANJI[i].id));
    if (applyProgressChange(nextM, new Set(hardSet))) {
      showToast('info', 'Hafalan Direset', `Data hafalan untuk level ${levelFilter} telah dihapus.`);
    }
  }, [mastered, hardSet, levelIndices, applyProgressChange, showToast, levelFilter]);

  const handleUnhardCurrent = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    if (!hardSet.has(item.id)) return;
    const nextH = new Set(hardSet);
    nextH.delete(item.id);
    if (!applyProgressChange(new Set(mastered), nextH)) return;
    setSessionHard(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleClearLevelHard = useCallback(() => {
    const nextH = new Set(hardSet);
    levelIndices.forEach(i => nextH.delete(KANJI[i].id));
    if (applyProgressChange(new Set(mastered), nextH)) {
      setSessionHard(new Set());
      showToast('info', 'Daftar Sulit Dihapus', `Daftar sulit untuk level ${levelFilter} telah dikosongkan.`);
    }
  }, [hardSet, mastered, levelIndices, applyProgressChange, showToast, levelFilter]);

  const handleToggleHideMastered = useCallback(() => {
    const nextHide = !hideMastered;
    setHideMastered(nextHide);
    const nextPool = computeCardPool(levelFilter, nextHide, hardMode, mastered, hardSet);
    rebuildOrder(nextPool, shuffleOn);
  }, [hideMastered, computeCardPool, levelFilter, hardMode, mastered, hardSet, rebuildOrder, shuffleOn]);

  const handleToggleShuffle = useCallback(() => {
    const nextShuffle = !shuffleOn;
    setShuffleOn(nextShuffle);
    const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, mastered, hardSet);
    rebuildOrder(nextPool, nextShuffle);
  }, [shuffleOn, computeCardPool, levelFilter, hideMastered, hardMode, mastered, hardSet, rebuildOrder]);

  const handleToggleHardMode = useCallback(() => {
    const nextHardMode = !hardMode;
    setHardMode(nextHardMode);
    const nextPool = computeCardPool(levelFilter, hideMastered, nextHardMode, mastered, hardSet);
    rebuildOrder(nextPool, shuffleOn);
  }, [hardMode, computeCardPool, levelFilter, hideMastered, mastered, hardSet, rebuildOrder, shuffleOn]);

  const handleRestartSession = useCallback(() => {
    const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, mastered, hardSet);
    rebuildOrder(nextPool, shuffleOn);
  }, [computeCardPool, levelFilter, hideMastered, hardMode, mastered, hardSet, rebuildOrder, shuffleOn]);

  const handleRepeatSessionHard = useCallback(() => {
    rebuildOrder([...sessionHard], shuffleOn);
  }, [sessionHard, rebuildOrder, shuffleOn]);

  // Global keyboard shortcuts for Flashcard mode (disabled when RestoreModal is open)
  useEffect(() => {
    if (activeTab !== 'card' || pendingRestore !== null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (pos >= order.length) return;

      if (e.key === ' ') {
        if (target?.closest('#flashcard') || target?.tagName === 'BUTTON') return;
        e.preventDefault();
        setFlipped(f => !f);
      } else if (e.key === 'ArrowLeft') {
        if (pos > 0) {
          e.preventDefault();
          setPos(p => p - 1);
          setFlipped(false);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPos(p => p + 1);
        setFlipped(false);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        handleMarkMastered();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleMarkHard();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const item = KANJI[order[pos]];
        if (item) speakJP(item.r);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeTab, pendingRestore, pos, order, handleMarkMastered, handleMarkHard]);

  const handleExport = useCallback(() => {
    try {
      const payload = buildBackupPayload(mastered, hardSet);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-kanji-n4-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(
        'success',
        'Backup Diunduh',
        `${mastered.size} hafal & ${hardSet.size} sulit diekspor ke JSON.`
      );
    } catch {
      showToast('error', 'Backup Gagal', 'Gagal membuat file backup JSON.');
    }
  }, [mastered, hardSet, showToast]);

  const restoreFocusToButton = useCallback(() => {
    requestAnimationFrame(() => {
      restoreBtnRef.current?.focus();
    });
  }, []);

  const handleTriggerImport = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const handleFileSelected = useCallback(
    (file: File) => {
      if (file.size > 1024 * 1024) {
        showToast('error', 'Restore Ditolak', 'Ukuran file terlalu besar (maksimal 1 MB).');
        restoreFocusToButton();
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        showToast(
          'error',
          'Gagal Membaca File',
          'File tidak dapat dibaca. Progres saat ini tetap aman.'
        );
        restoreFocusToButton();
      };
      reader.onabort = () => {
        showToast('warning', 'Restore Dibatalkan', 'Pembacaan file dihentikan.');
        restoreFocusToButton();
      };
      reader.onload = ev => {
        try {
          const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
          const parsed = validateAndParseBackup(text);
          setToast(null);
          setPendingRestore({ parsed, fileName: file.name });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'File backup tidak valid atau rusak.';
          showToast(
            'error',
            'Restore Ditolak',
            `${msg} Progres saat ini tetap aman dan tidak berubah.`
          );
          restoreFocusToButton();
        }
      };
      reader.readAsText(file);
    },
    [showToast, restoreFocusToButton]
  );

  const restorePreviews = useMemo(() => {
    if (!pendingRestore) {
      return { mergedMastered: 0, mergedHard: 0, cleanImpHard: 0 };
    }
    const { impMastered, impHard } = pendingRestore.parsed;
    const mergedM = new Set([...mastered, ...impMastered]);
    const mergedH = new Set([...hardSet, ...impHard].filter(id => !mergedM.has(id)));
    const cleanImpH = impHard.filter(id => !impMastered.includes(id));
    return {
      mergedMastered: mergedM.size,
      mergedHard: mergedH.size,
      cleanImpHard: cleanImpH.length,
    };
  }, [pendingRestore, mastered, hardSet]);

  const handleCloseRestoreModal = useCallback(() => {
    setPendingRestore(null);
    restoreFocusToButton();
  }, [restoreFocusToButton]);

  const handleConfirmRestore = useCallback(
    (mode: 'merge' | 'replace') => {
      if (!pendingRestore) return;
      const { impMastered, impHard, rejectedIds } = pendingRestore.parsed;

      let nextMastered: Set<string>;
      let nextHard: Set<string>;

      if (mode === 'merge') {
        nextMastered = new Set(mastered);
        nextHard = new Set(hardSet);
        impMastered.forEach(id => {
          nextMastered.add(id);
          nextHard.delete(id);
        });
        impHard.forEach(id => {
          if (!nextMastered.has(id)) nextHard.add(id);
        });
      } else {
        nextMastered = new Set(impMastered);
        nextHard = new Set(impHard.filter(id => !nextMastered.has(id)));
      }

      const committed = applyProgressChange(nextMastered, nextHard);
      setPendingRestore(null);
      restoreFocusToButton();
      if (!committed) return;

      const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, nextMastered, nextHard);
      rebuildOrder(nextPool, shuffleOn);

      const modeLabel = mode === 'merge' ? 'digabungkan' : 'ditimpa';
      const rejectedNote = rejectedIds.length
        ? `${rejectedIds.length} ID tidak dikenali diabaikan.`
        : undefined;

      showToast(
        'success',
        `Progres berhasil ${modeLabel}: ${nextMastered.size} hafal & ${nextHard.size} sulit.`,
        rejectedNote
      );
    },
    [
      pendingRestore,
      mastered,
      hardSet,
      applyProgressChange,
      restoreFocusToButton,
      computeCardPool,
      levelFilter,
      hideMastered,
      hardMode,
      rebuildOrder,
      shuffleOn,
      showToast,
    ]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <div
        aria-hidden={pendingRestore !== null}
        className="flex-1 flex flex-col"
      >
        <AppHeader
          masteredCount={levelMasteredCount}
          totalCount={levelIndices.length}
          restoreBtnRef={restoreBtnRef}
          fileInputRef={fileInputRef}
          user={user}
          authReady={authReady}
          authBusy={authBusy}
          syncing={syncing}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
          onExport={handleExport}
          onTriggerImport={handleTriggerImport}
          onFileSelected={handleFileSelected}
        />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
            <Sidebar
              activeTab={activeTab}
              levelFilter={levelFilter}
              onSelectTab={setActiveTab}
              onSelectLevel={handleSelectLevel}
            />

            <div className="min-w-0">
              {activeTab === 'card' ? (
                <FlashcardPanel
                  levelFilter={levelFilter}
                  order={order}
                  pos={pos}
                  flipped={flipped}
                  hideMastered={hideMastered}
                  shuffleOn={shuffleOn}
                  hardMode={hardMode}
                  mastered={mastered}
                  hardSet={hardSet}
                  levelHardCount={levelHardCount}
                  levelMasteredCount={levelMasteredCount}
                  sessionHardCount={sessionHard.size}
                  sessionNewMaster={sessionNewMaster}
                  onFlip={() => setFlipped(f => !f)}
                  onPrev={() => {
                    if (pos > 0) {
                      setPos(p => p - 1);
                      setFlipped(false);
                    }
                  }}
                  onNext={() => {
                    setPos(p => p + 1);
                    setFlipped(false);
                  }}
                  onMarkMastered={handleMarkMastered}
                  onMarkHard={handleMarkHard}
                  onForgetCurrent={handleForgetCurrent}
                  onResetAllLevelMastered={handleResetAllLevelMastered}
                  onUnhardCurrent={handleUnhardCurrent}
                  onClearLevelHard={handleClearLevelHard}
                  onToggleHideMastered={handleToggleHideMastered}
                  onToggleShuffle={handleToggleShuffle}
                  onToggleHardMode={handleToggleHardMode}
                  onRestartSession={handleRestartSession}
                  onRepeatSessionHard={handleRepeatSessionHard}
                />
              ) : null}

              {activeTab === 'list' ? (
                <KanjiListPanel
                  levelFilter={levelFilter}
                  mastered={mastered}
                  hardSet={hardSet}
                />
              ) : null}

              {activeTab === 'quiz' ? (
                <QuizPanel
                  levelFilter={levelFilter}
                  modalOpen={pendingRestore !== null}
                />
              ) : null}
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-200 bg-white/70 py-5 px-4 text-center text-xs text-slate-500">
          {user
            ? `500 kosakata kanji JLPT N4 · hingga 2.500 variasi soal kuis · tersinkronisasi ke akun Google (${user.email || user.displayName || 'terhubung'})`
            : '500 kosakata kanji JLPT N4 · hingga 2.500 variasi soal kuis · tersimpan lokal (masuk Google untuk sinkronisasi cloud)'}
        </footer>
      </div>

      <RestoreModal
        pending={pendingRestore}
        currentMasteredCount={mastered.size}
        currentHardCount={hardSet.size}
        mergedMasteredCount={restorePreviews.mergedMastered}
        mergedHardCount={restorePreviews.mergedHard}
        cleanBackupHardCount={restorePreviews.cleanImpHard}
        onConfirm={handleConfirmRestore}
        onClose={handleCloseRestoreModal}
      />

      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
