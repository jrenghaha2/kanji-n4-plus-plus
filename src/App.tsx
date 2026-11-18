import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { AppHeader } from './components/AppHeader';
import { AuthModal } from './components/AuthModal';
import { FlashcardPanel } from './components/FlashcardPanel';
import { KanjiListPanel } from './components/KanjiListPanel';
import { ProfileModal } from './components/ProfileModal';
import { QuizPanel } from './components/QuizPanel';
import { RestoreModal, type PendingRestoreState } from './components/RestoreModal';
import { Sidebar } from './components/Sidebar';
import { ToastBanner } from './components/ToastBanner';
import { KANJI } from './data/kanjiData';
import {
  OperationType,
  auth,
  createGoogleAccountPickerProvider,
  db,
  getFirestoreUpgradeUrl,
  githubProvider,
  googleProvider,
  handleFirestoreError,
  isFirestoreQuotaError,
} from './firebase';
import type { AppTab, LevelFilter, ToastMessage } from './types/kanji';
import {
  areSetsEqual,
  buildUserProfileWriteData,
  buildUserProgressWriteData,
  mergeProgressSets,
  sanitizeAvatarUrl,
  sanitizeDisplayName,
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

function mapFirebaseAuthError(err: unknown): {
  code: string;
  message: string;
  showConsoleHint: boolean;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return {
        code,
        message: 'Jendela login ditutup sebelum selesai.',
        showConsoleHint: false,
      };
    case 'auth/popup-blocked':
      return {
        code,
        message: 'Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.',
        showConsoleHint: false,
      };
    case 'auth/operation-not-allowed':
      return {
        code,
        message: 'Metode login ini belum diaktifkan di Firebase Console.',
        showConsoleHint: true,
      };
    case 'auth/account-exists-with-different-credential':
      return {
        code,
        message:
          'Email ini sudah terdaftar dengan metode login lain. Gunakan metode login sebelumnya.',
        showConsoleHint: false,
      };
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        code,
        message: 'Email atau kata sandi tidak cocok.',
        showConsoleHint: false,
      };
    case 'auth/email-already-in-use':
      return {
        code,
        message: 'Email ini sudah terdaftar. Silakan masuk pada tab Masuk.',
        showConsoleHint: false,
      };
    case 'auth/weak-password':
      return {
        code,
        message: 'Kata sandi terlalu lemah (gunakan minimal 6 karakter).',
        showConsoleHint: false,
      };
    case 'auth/invalid-email':
      return {
        code,
        message: 'Format alamat email tidak valid.',
        showConsoleHint: false,
      };
    case 'auth/too-many-requests':
      return {
        code,
        message: 'Terlalu banyak percobaan. Tunggu beberapa saat sebelum mencoba lagi.',
        showConsoleHint: false,
      };
    case 'auth/network-request-failed':
      return {
        code,
        message: 'Koneksi internet bermasalah. Periksa jaringan Anda lalu coba lagi.',
        showConsoleHint: false,
      };
    default:
      return {
        code,
        message: err instanceof Error ? err.message : 'Gagal memproses autentikasi.',
        showConsoleHint: false,
      };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('card');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');

  const [mastered, setMastered] = useState<Set<string>>(() => safeLoadSet(LS_KEY));
  const [hardSet, setHardSet] = useState<Set<string>>(() => safeLoadSet(HARD_KEY));

  const [user, setUser] = useState<User | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [customDisplayName, setCustomDisplayName] = useState('');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authSwitchMode, setAuthSwitchMode] = useState(false);
  const [authErrorText, setAuthErrorText] = useState<string | null>(null);
  const [authInfoText, setAuthInfoText] = useState<string | null>(null);
  const [authConsoleHint, setAuthConsoleHint] = useState(false);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

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
  const customNameRef = useRef(customDisplayName);
  customNameRef.current = customDisplayName;
  const customAvatarRef = useRef(customAvatarUrl);
  customAvatarRef.current = customAvatarUrl;
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
      setAuthVersion(v => v + 1);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore initial sync + real-time listener (attached only when auth is ready, user exists & email verified)
  useEffect(() => {
    if (!authReady || !user) {
      cloudDocExistsRef.current = false;
      setCustomDisplayName('');
      setCustomAvatarUrl('');
      setSyncing(false);
      return;
    }

    const uid = user.uid;
    if (!user.emailVerified) {
      cloudDocExistsRef.current = false;
      setStoredOwnerUid(uid);
      setCustomDisplayName(sanitizeDisplayName(user.displayName));
      setCustomAvatarUrl(sanitizeAvatarUrl(user.photoURL));
      setSyncing(false);
      return;
    }

    let cancelled = false;
    let unsubSnapshot: (() => void) | null = null;
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
          const initialName = sanitizeDisplayName(customNameRef.current || user.displayName);
          const initialAvatar = sanitizeAvatarUrl(customAvatarRef.current || user.photoURL);
          try {
            await setDoc(userDocRef, {
              ...payload,
              displayName: initialName,
              avatarUrl: initialAvatar,
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
          setCustomDisplayName(initialName);
          setCustomAvatarUrl(initialAvatar);

          if (justSignedInRef.current) {
            showToast(
              'success',
              'Login Berhasil',
              cleanLocalM.size > 0
                ? `${cleanLocalM.size} kanji hafal disinkronkan ke akun Anda.`
                : 'Akun terhubung. Progres belajar akan tersimpan ke cloud.'
            );
            justSignedInRef.current = false;
          }
        } else {
          cloudDocExistsRef.current = true;
          const data = snap.data() as {
            mastered?: unknown[];
            hard?: unknown[];
            displayName?: unknown;
            avatarUrl?: unknown;
          };
          const cleanCloud = sanitizeProgressLists(
            Array.isArray(data.mastered) ? data.mastered : [],
            Array.isArray(data.hard) ? data.hard : []
          );
          const cloudMSet = new Set(cleanCloud.mastered);
          const cloudHSet = new Set(cleanCloud.hard);

          const cloudName = sanitizeDisplayName(data.displayName) || sanitizeDisplayName(user.displayName);
          const cloudAvatar = sanitizeAvatarUrl(data.avatarUrl);
          setCustomDisplayName(cloudName);
          setCustomAvatarUrl(cloudAvatar);

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
                `${merged.addedFromSecondary} progres lokal digabungkan ke akun Anda.`
              );
              justSignedInRef.current = false;
            }
          } else if (justSignedInRef.current) {
            showToast(
              'success',
              'Login Berhasil',
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
            const raw = docSnap.data() as {
              mastered?: unknown[];
              hard?: unknown[];
              displayName?: unknown;
              avatarUrl?: unknown;
            };
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
            const nextName = sanitizeDisplayName(raw.displayName);
            const nextAvatar = sanitizeAvatarUrl(raw.avatarUrl);
            if (nextName && nextName !== customNameRef.current) {
              setCustomDisplayName(nextName);
            }
            if (nextAvatar !== customAvatarRef.current) {
              setCustomAvatarUrl(nextAvatar);
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
  }, [authReady, user, authVersion, reportFirestoreFailure, showToast]);

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
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.emailVerified) return;

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
            displayName: sanitizeDisplayName(customNameRef.current || currentUser.displayName),
            avatarUrl: sanitizeAvatarUrl(customAvatarRef.current || currentUser.photoURL),
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
        if (user.emailVerified) {
          void syncProgressToCloud(user.uid, cleanM, cleanH);
        }
      }

      setMastered(cleanM);
      setHardSet(cleanH);
      return true;
    },
    [showToast, user, syncProgressToCloud]
  );

  const clearAuthNotices = useCallback(() => {
    setAuthErrorText(null);
    setAuthInfoText(null);
    setAuthConsoleHint(false);
  }, []);

  const handleOpenAuthModal = useCallback(
    (isSwitch: boolean) => {
      clearAuthNotices();
      setAuthSwitchMode(isSwitch);
      setAuthModalOpen(true);
    },
    [clearAuthNotices]
  );

  const handleGoogleLogin = useCallback(
    async (forceSelectAccount: boolean) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      justSignedInRef.current = true;
      try {
        const provider = forceSelectAccount
          ? createGoogleAccountPickerProvider()
          : googleProvider;
        await signInWithPopup(auth, provider);
        setAuthModalOpen(false);
      } catch (err) {
        justSignedInRef.current = false;
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices]
  );

  const handleGithubLogin = useCallback(async () => {
    if (authBusy) return;
    clearAuthNotices();
    setAuthBusy(true);
    justSignedInRef.current = true;
    try {
      await signInWithPopup(auth, githubProvider);
      setAuthModalOpen(false);
    } catch (err) {
      justSignedInRef.current = false;
      const mapped = mapFirebaseAuthError(err);
      setAuthErrorText(mapped.message);
      setAuthConsoleHint(mapped.showConsoleHint);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, clearAuthNotices]);

  const handleEmailSignIn = useCallback(
    async (email: string, password: string) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      justSignedInRef.current = true;
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        setAuthModalOpen(false);
        if (!cred.user.emailVerified) {
          showToast(
            'warning',
            'Verifikasi Email Diperlukan',
            `Cek kotak masuk ${cred.user.email} untuk mengaktifkan sinkronisasi cloud.`
          );
        }
      } catch (err) {
        justSignedInRef.current = false;
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices, showToast]
  );

  const handleEmailSignUp = useCallback(
    async (name: string, email: string, password: string) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      justSignedInRef.current = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const cleanName = sanitizeDisplayName(name) || email.trim().split('@')[0];
        if (cleanName) {
          await updateProfile(cred.user, { displayName: cleanName });
        }
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // Non-fatal if rate-limited
        }
        setAuthModalOpen(false);
        showToast(
          'info',
          'Akun Dibuat · Cek Email',
          `Tautan verifikasi dikirim ke ${cred.user.email}. Verifikasi untuk mulai sinkronisasi cloud.`
        );
      } catch (err) {
        justSignedInRef.current = false;
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices, showToast]
  );

  const handleEmailReset = useCallback(
    async (email: string) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      try {
        await sendPasswordResetEmail(auth, email.trim());
        setAuthInfoText(`Tautan reset kata sandi telah dikirim ke ${email.trim()}.`);
      } catch (err) {
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices]
  );

  const handleResendVerification = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || authBusy) return;
    setAuthBusy(true);
    try {
      await sendEmailVerification(current);
      showToast('success', 'Email Verifikasi Terkirim', `Periksa kotak masuk ${current.email}.`);
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      showToast('error', 'Gagal Mengirim Email', mapped.message);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, showToast]);

  const handleRefreshVerification = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || authBusy) return;
    setAuthBusy(true);
    try {
      await current.reload();
      await current.getIdToken(true);
      setAuthVersion(v => v + 1);
      if (current.emailVerified) {
        showToast('success', 'Email Terverifikasi', 'Sinkronisasi cloud kini aktif.');
      } else {
        showToast(
          'info',
          'Belum Terverifikasi',
          'Silakan klik tautan verifikasi di email Anda lalu tekan Cek Status lagi.'
        );
      }
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      showToast('error', 'Gagal Memeriksa Status', mapped.message);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, showToast]);

  const handleManualSync = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || !current.emailVerified || syncing) return;
    setSyncing(true);
    try {
      await syncProgressToCloud(current.uid, masteredRef.current, hardRef.current);
      showToast('success', 'Sinkronisasi Selesai', 'Progres terbaru telah disimpan ke cloud.');
    } finally {
      setSyncing(false);
    }
  }, [syncing, syncProgressToCloud, showToast]);

  const handleSaveProfile = useCallback(
    async (nextName: string, nextAvatarUrl: string): Promise<boolean> => {
      const current = auth.currentUser;
      if (!current) return false;
      setProfileSaving(true);
      try {
        const clean = buildUserProfileWriteData(nextName, nextAvatarUrl);
        await updateProfile(current, {
          displayName: clean.displayName,
          ...(clean.avatarUrl === '' || clean.avatarUrl.startsWith('https://')
            ? { photoURL: clean.avatarUrl }
            : {}),
        });

        setCustomDisplayName(clean.displayName);
        setCustomAvatarUrl(clean.avatarUrl);
        setAuthVersion(v => v + 1);

        if (current.emailVerified) {
          const docPath = `users/${current.uid}`;
          const userDocRef = doc(db, 'users', current.uid);
          try {
            if (cloudDocExistsRef.current) {
              await updateDoc(userDocRef, {
                displayName: clean.displayName,
                avatarUrl: clean.avatarUrl,
                updatedAt: serverTimestamp(),
              });
            } else {
              const payload = buildUserProgressWriteData(
                current.uid,
                masteredRef.current,
                hardRef.current
              );
              await setDoc(userDocRef, {
                ...payload,
                displayName: clean.displayName,
                avatarUrl: clean.avatarUrl,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              cloudDocExistsRef.current = true;
            }
          } catch (err) {
            reportFirestoreFailure(
              err,
              cloudDocExistsRef.current ? OperationType.UPDATE : OperationType.CREATE,
              docPath
            );
            return false;
          }
        }

        showToast('success', 'Profil Diperbarui', 'Nama dan foto profil Anda telah disimpan.');
        return true;
      } catch (err) {
        showToast(
          'error',
          'Gagal Memperbarui Profil',
          err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan profil.'
        );
        return false;
      } finally {
        setProfileSaving(false);
      }
    },
    [reportFirestoreFailure, showToast]
  );

  const handleSignOut = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await signOut(auth);
      cloudDocExistsRef.current = false;
      justSignedInRef.current = false;
      setCustomDisplayName('');
      setCustomAvatarUrl('');
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
        'Progres Anda tetap tersimpan aman di akun Anda.'
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

  const anyModalOpen = pendingRestore !== null || authModalOpen || profileModalOpen;

  // Global keyboard shortcuts for Flashcard mode (disabled when any modal is open)
  useEffect(() => {
    if (activeTab !== 'card' || anyModalOpen) return;

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
  }, [activeTab, anyModalOpen, pos, order, handleMarkMastered, handleMarkHard]);

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

  const effectiveDisplayName =
    customDisplayName || user?.displayName || user?.email?.split('@')[0] || '';
  const effectiveAvatarUrl = customAvatarUrl || user?.photoURL || '';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <div
        aria-hidden={anyModalOpen}
        className="flex-1 flex flex-col"
      >
        <AppHeader
          masteredCount={levelMasteredCount}
          totalCount={levelIndices.length}
          restoreBtnRef={restoreBtnRef}
          fileInputRef={fileInputRef}
          user={user}
          displayName={effectiveDisplayName}
          avatarUrl={effectiveAvatarUrl}
          authReady={authReady}
          authBusy={authBusy}
          syncing={syncing}
          onOpenAuthModal={handleOpenAuthModal}
          onOpenProfileModal={() => setProfileModalOpen(true)}
          onManualSync={() => void handleManualSync()}
          onResendVerification={() => void handleResendVerification()}
          onRefreshVerification={() => void handleRefreshVerification()}
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
                  modalOpen={anyModalOpen}
                />
              ) : null}
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-200 bg-white/70 py-5 px-4 text-center text-xs text-slate-500">
          {user
            ? `500 kosakata kanji JLPT N4 · hingga 2.500 variasi soal kuis · akun ${effectiveDisplayName || user.email || 'terhubung'}${user.emailVerified ? ' (cloud aktif)' : ' (menunggu verifikasi email)'}`
            : '500 kosakata kanji JLPT N4 · hingga 2.500 variasi soal kuis · tersimpan lokal (masuk untuk sinkronisasi cloud)'}
        </footer>
      </div>

      <AuthModal
        open={authModalOpen}
        isSwitchingAccount={authSwitchMode}
        busy={authBusy}
        errorText={authErrorText}
        infoText={authInfoText}
        showConsoleHint={authConsoleHint}
        onClearNotice={clearAuthNotices}
        onGoogleLogin={forceSelect => void handleGoogleLogin(forceSelect)}
        onGithubLogin={() => void handleGithubLogin()}
        onEmailSignIn={(em, pw) => void handleEmailSignIn(em, pw)}
        onEmailSignUp={(nm, em, pw) => void handleEmailSignUp(nm, em, pw)}
        onEmailReset={em => void handleEmailReset(em)}
        onClose={() => setAuthModalOpen(false)}
      />

      <ProfileModal
        open={profileModalOpen}
        initialName={effectiveDisplayName}
        initialAvatarUrl={customAvatarUrl}
        fallbackAuthPhoto={user?.photoURL || ''}
        saving={profileSaving}
        onSave={handleSaveProfile}
        onClose={() => setProfileModalOpen(false)}
      />

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
