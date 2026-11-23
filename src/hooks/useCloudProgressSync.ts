import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { updateProfile, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { RecordQuizSessionInput } from '../components/QuizPanel';
import { IRODORI_BOOKS, IRODORI_BOOK_ORDER } from '../data/irodoriBooks';
import {
  OperationType,
  auth,
  db,
  getFirestoreUpgradeUrl,
  handleFirestoreError,
  isFirestoreQuotaError,
} from '../firebase';
import type { UserRole } from '../types/admin';
import type {
  AppDatasetMode,
  AppTab,
  IrodoriBookId,
  QuizDatasetId,
  QuizSessionHistoryEntry,
} from '../types/kanji';
import {
  isBootstrapSuperAdminEmail,
  isValidUserRole,
  normalizeEmail,
  resolveEffectiveRole,
} from '../utils/rbac';
import {
  areSetsEqual,
  buildIrodoriProgressWriteData,
  buildUserProfileWriteData,
  buildUserProgressWriteData,
  mergeIrodoriProgressSets,
  mergeProgressSets,
  sanitizeAvatarUrl,
  sanitizeDisplayName,
  sanitizeIrodoriProgressLists,
  sanitizeProgressLists,
} from '../utils/progressSync';
import {
  QUIZ_DATASET_IDS,
  areQuizHistoriesEqual,
  buildQuizHistoryWriteData,
  decodeQuizHistoryFromCloud,
  mergeQuizHistories,
} from '../utils/quizHistorySync';
import {
  QUIZ_HISTORY_KEYS_BY_DATASET,
  clearQuizHistory,
  loadQuizHistory,
  recordQuizSession,
  saveQuizHistory,
} from '../utils/quizStats';
import {
  HARD_KEY,
  LS_KEY,
  clearStoredProgress,
  commitProgressTransaction,
  commitScopedProgressTransaction,
  getStoredOwnerUid,
  safeLoadSet,
  setStoredOwnerUid,
} from '../utils/storage';
import type { ShowToastFn } from './useToast';

export type IrodoriProgressMap = Record<
  IrodoriBookId,
  { mastered: Set<string>; hard: Set<string> }
>;

interface UseCloudProgressSyncOptions {
  user: User | null;
  authReady: boolean;
  authVersion: number;
  justSignedInRef: MutableRefObject<boolean>;
  activeTab: AppTab;
  datasetMode: AppDatasetMode;
  irodoriBookId: IrodoriBookId;
  bumpAuthVersion: () => void;
  showToast: ShowToastFn;
}

export function useCloudProgressSync({
  user,
  authReady,
  authVersion,
  justSignedInRef,
  activeTab,
  datasetMode,
  irodoriBookId,
  bumpAuthVersion,
  showToast,
}: UseCloudProgressSyncOptions) {
  const [mastered, setMastered] = useState<Set<string>>(() => safeLoadSet(LS_KEY));
  const [hardSet, setHardSet] = useState<Set<string>>(() => {
    const m = safeLoadSet(LS_KEY);
    const h = safeLoadSet(HARD_KEY);
    m.forEach(id => h.delete(id));
    return h;
  });

  const [irodoriProgress, setIrodoriProgress] = useState<IrodoriProgressMap>(() => {
    const initial = {} as IrodoriProgressMap;
    for (const bookId of IRODORI_BOOK_ORDER) {
      const cfg = IRODORI_BOOKS[bookId];
      const m = safeLoadSet(cfg.lsKey, cfg.validIds);
      const h = safeLoadSet(cfg.hardKey, cfg.validIds);
      m.forEach(id => h.delete(id));
      initial[bookId] = { mastered: m, hard: h };
    }
    return initial;
  });

  const [quizHistories, setQuizHistories] = useState<
    Record<QuizDatasetId, QuizSessionHistoryEntry[]>
  >(() => ({
    n4: loadQuizHistory(undefined, QUIZ_HISTORY_KEYS_BY_DATASET.n4),
    pemula: loadQuizHistory(undefined, QUIZ_HISTORY_KEYS_BY_DATASET.pemula),
    dasar1: loadQuizHistory(undefined, QUIZ_HISTORY_KEYS_BY_DATASET.dasar1),
    dasar2: loadQuizHistory(undefined, QUIZ_HISTORY_KEYS_BY_DATASET.dasar2),
  }));

  const [cloudReadyUid, setCloudReadyUid] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('user');
  const [roleResolved, setRoleResolved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [quizHistorySyncing, setQuizHistorySyncing] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [customDisplayName, setCustomDisplayName] = useState('');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const masteredRef = useRef(mastered);
  masteredRef.current = mastered;
  const hardRef = useRef(hardSet);
  hardRef.current = hardSet;
  const irodoriProgressRef = useRef(irodoriProgress);
  irodoriProgressRef.current = irodoriProgress;
  const quizHistoriesRef = useRef(quizHistories);
  quizHistoriesRef.current = quizHistories;
  const customNameRef = useRef(customDisplayName);
  customNameRef.current = customDisplayName;
  const customAvatarRef = useRef(customAvatarUrl);
  customAvatarRef.current = customAvatarUrl;

  const cloudDocExistsRef = useRef(false);
  const irodoriCloudDocExistsRef = useRef<Record<IrodoriBookId, boolean>>({
    pemula: false,
    dasar1: false,
    dasar2: false,
  });
  const quizHistoryCloudExistsRef = useRef<Record<QuizDatasetId, boolean>>({
    n4: false,
    pemula: false,
    dasar1: false,
    dasar2: false,
  });
  const quizHistoryLoadedRef = useRef<Record<QuizDatasetId, boolean>>({
    n4: false,
    pemula: false,
    dasar1: false,
    dasar2: false,
  });
  const quizHistoryLoadingRef = useRef<Record<QuizDatasetId, boolean>>({
    n4: false,
    pemula: false,
    dasar1: false,
    dasar2: false,
  });
  const quizHistoryCanMergeLocalRef = useRef(true);

  const activeQuizDatasetId: QuizDatasetId = datasetMode === 'irodori' ? irodoriBookId : 'n4';

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

  // Firestore initial sync + real-time listeners (N4 + all 3 Irodori books)
  useEffect(() => {
    if (!authReady || !user) {
      cloudDocExistsRef.current = false;
      irodoriCloudDocExistsRef.current = { pemula: false, dasar1: false, dasar2: false };
      quizHistoryCloudExistsRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
      quizHistoryLoadedRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
      quizHistoryLoadingRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
      quizHistoryCanMergeLocalRef.current = true;
      setCloudReadyUid(null);
      setUserRole('user');
      setRoleResolved(authReady);
      setCustomDisplayName('');
      setCustomAvatarUrl('');
      setSyncing(false);
      return;
    }

    const uid = user.uid;
    if (!user.emailVerified) {
      cloudDocExistsRef.current = false;
      irodoriCloudDocExistsRef.current = { pemula: false, dasar1: false, dasar2: false };
      quizHistoryCloudExistsRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
      quizHistoryLoadedRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
      quizHistoryLoadingRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
      setCloudReadyUid(null);
      setUserRole('user');
      setRoleResolved(true);
      setStoredOwnerUid(uid);
      setCustomDisplayName(sanitizeDisplayName(user.displayName));
      setCustomAvatarUrl(sanitizeAvatarUrl(user.photoURL));
      setSyncing(false);
      return;
    }

    setUserRole(isBootstrapSuperAdminEmail(user.email) ? 'superadmin' : 'user');
    setRoleResolved(false);

    let cancelled = false;
    const unsubSnapshots: Array<() => void> = [];
    const docPath = `users/${uid}`;
    const userDocRef = doc(db, 'users', uid);

    quizHistoryCloudExistsRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
    quizHistoryLoadedRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
    quizHistoryLoadingRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };

    const bootstrapCloudSync = async () => {
      setSyncing(true);
      try {
        const snap = await getDoc(userDocRef);
        if (cancelled) return;

        const storedOwner = getStoredOwnerUid();
        const canMergeLocal = storedOwner === null || storedOwner === uid;
        quizHistoryCanMergeLocalRef.current = canMergeLocal;
        if (!canMergeLocal) {
          for (const dsId of QUIZ_DATASET_IDS) {
            clearQuizHistory(undefined, QUIZ_HISTORY_KEYS_BY_DATASET[dsId]);
          }
          setQuizHistories({ n4: [], pemula: [], dasar1: [], dasar2: [] });
        }
        const localM = canMergeLocal ? masteredRef.current : new Set<string>();
        const localH = canMergeLocal ? hardRef.current : new Set<string>();

        let isNewCloudAccount = false;
        let n4MasteredCount = 0;
        let n4HardCount = 0;
        let totalMergedFromLocal = 0;
        let totalLocalSyncedOnCreate = 0;

        if (!snap.exists()) {
          isNewCloudAccount = true;
          cloudDocExistsRef.current = false;
          const payload = buildUserProgressWriteData(uid, localM, localH);
          const initialName = sanitizeDisplayName(customNameRef.current || user.displayName);
          const initialAvatar = sanitizeAvatarUrl(customAvatarRef.current || user.photoURL);
          const initialEmail = normalizeEmail(user.email);
          const initialRole: UserRole = isBootstrapSuperAdminEmail(user.email)
            ? 'superadmin'
            : 'user';
          try {
            await setDoc(userDocRef, {
              ...payload,
              displayName: initialName,
              email: initialEmail,
              avatarUrl: initialAvatar,
              role: initialRole,
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
          setUserRole(initialRole);
          setRoleResolved(true);
          n4MasteredCount = cleanLocalM.size;
          n4HardCount = cleanLocalH.size;
          totalLocalSyncedOnCreate += cleanLocalM.size + cleanLocalH.size;
        } else {
          cloudDocExistsRef.current = true;
          const data = snap.data() as {
            mastered?: unknown[];
            hard?: unknown[];
            displayName?: unknown;
            email?: unknown;
            avatarUrl?: unknown;
            role?: unknown;
          };
          const cleanCloud = sanitizeProgressLists(
            Array.isArray(data.mastered) ? data.mastered : [],
            Array.isArray(data.hard) ? data.hard : []
          );
          const cloudMSet = new Set(cleanCloud.mastered);
          const cloudHSet = new Set(cleanCloud.hard);

          const existingName = sanitizeDisplayName(data.displayName);
          const authName = sanitizeDisplayName(user.displayName);
          const cloudName = existingName || authName;

          const existingAvatar = sanitizeAvatarUrl(data.avatarUrl);
          const authAvatar = sanitizeAvatarUrl(user.photoURL);
          const cloudAvatar = existingAvatar || authAvatar;

          const existingEmail = normalizeEmail(data.email);
          const authEmail = normalizeEmail(user.email);

          const isBootstrap = isBootstrapSuperAdminEmail(user.email);
          const hasStoredRole = isValidUserRole(data.role);
          const effectiveRole = resolveEffectiveRole(user, data.role);

          setCustomDisplayName(cloudName);
          setCustomAvatarUrl(cloudAvatar);
          setUserRole(effectiveRole);
          setRoleResolved(true);

          const merged = mergeProgressSets(cloudMSet, cloudHSet, localM, localH);

          // Auto-heal legacy user metadata without overwriting existing non-bootstrap roles
          const patch: Record<string, unknown> = {};
          if (merged.addedFromSecondary > 0) {
            const payload = buildUserProgressWriteData(uid, merged.mastered, merged.hard);
            patch.mastered = payload.mastered;
            patch.hard = payload.hard;
          }
          if (authEmail && existingEmail !== authEmail) {
            patch.email = authEmail;
          }
          if (!existingName && authName) {
            patch.displayName = authName;
          }
          if (!existingAvatar && authAvatar) {
            patch.avatarUrl = authAvatar;
          }
          if (!hasStoredRole) {
            patch.role = isBootstrap ? 'superadmin' : 'user';
          } else if (isBootstrap && data.role !== 'superadmin') {
            patch.role = 'superadmin';
          }

          if (Object.keys(patch).length > 0) {
            patch.updatedAt = serverTimestamp();
            try {
              await updateDoc(userDocRef, patch);
              if (cancelled) return;
              if (merged.addedFromSecondary > 0) {
                totalMergedFromLocal += merged.addedFromSecondary;
              }
            } catch (updateErr) {
              if (!cancelled) reportFirestoreFailure(updateErr, OperationType.UPDATE, docPath);
              return;
            }
          }

          commitProgressTransaction(merged.mastered, merged.hard);
          setStoredOwnerUid(uid);
          setMastered(merged.mastered);
          setHardSet(merged.hard);
          n4MasteredCount = merged.mastered.size;
          n4HardCount = merged.hard.size;
        }

        if (cancelled) return;

        // Bootstrap & subscribe to all 3 Irodori books under /users/{uid}/irodoriProgress/{bookId}
        let totalIrodoriMastered = 0;
        let totalIrodoriHard = 0;

        for (const bookId of IRODORI_BOOK_ORDER) {
          if (cancelled) return;
          const cfg = IRODORI_BOOKS[bookId];
          const bookDocPath = `users/${uid}/irodoriProgress/${bookId}`;
          const bookDocRef = doc(db, 'users', uid, 'irodoriProgress', bookId);

          let bookSnap;
          try {
            bookSnap = await getDoc(bookDocRef);
          } catch (bookGetErr) {
            if (!cancelled) reportFirestoreFailure(bookGetErr, OperationType.GET, bookDocPath);
            return;
          }
          if (cancelled) return;

          const localBookM = canMergeLocal
            ? irodoriProgressRef.current[bookId].mastered
            : new Set<string>();
          const localBookH = canMergeLocal
            ? irodoriProgressRef.current[bookId].hard
            : new Set<string>();

          if (!bookSnap.exists()) {
            irodoriCloudDocExistsRef.current[bookId] = false;
            const cleanLocalBook = sanitizeIrodoriProgressLists(bookId, localBookM, localBookH);
            const cleanLocalBookM = new Set(cleanLocalBook.mastered);
            const cleanLocalBookH = new Set(cleanLocalBook.hard);

            if (cleanLocalBookM.size > 0 || cleanLocalBookH.size > 0) {
              const payload = buildIrodoriProgressWriteData(
                uid,
                bookId,
                cleanLocalBookM,
                cleanLocalBookH
              );
              try {
                await setDoc(bookDocRef, {
                  ...payload,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                if (cancelled) return;
                irodoriCloudDocExistsRef.current[bookId] = true;
                totalLocalSyncedOnCreate += cleanLocalBookM.size + cleanLocalBookH.size;
              } catch (bookCreateErr) {
                if (!cancelled) {
                  reportFirestoreFailure(bookCreateErr, OperationType.CREATE, bookDocPath);
                }
                return;
              }
            }

            commitScopedProgressTransaction(
              cfg.lsKey,
              cfg.hardKey,
              cleanLocalBookM,
              cleanLocalBookH
            );
            setIrodoriProgress(prev => ({
              ...prev,
              [bookId]: { mastered: cleanLocalBookM, hard: cleanLocalBookH },
            }));
            totalIrodoriMastered += cleanLocalBookM.size;
            totalIrodoriHard += cleanLocalBookH.size;
          } else {
            irodoriCloudDocExistsRef.current[bookId] = true;
            const bookData = bookSnap.data() as {
              mastered?: unknown[];
              hard?: unknown[];
            };
            const cleanCloudBook = sanitizeIrodoriProgressLists(
              bookId,
              Array.isArray(bookData.mastered) ? bookData.mastered : [],
              Array.isArray(bookData.hard) ? bookData.hard : []
            );
            const cloudBookM = new Set(cleanCloudBook.mastered);
            const cloudBookH = new Set(cleanCloudBook.hard);

            const mergedBook = mergeIrodoriProgressSets(
              bookId,
              cloudBookM,
              cloudBookH,
              localBookM,
              localBookH
            );

            if (mergedBook.addedFromSecondary > 0) {
              const payload = buildIrodoriProgressWriteData(
                uid,
                bookId,
                mergedBook.mastered,
                mergedBook.hard
              );
              try {
                await updateDoc(bookDocRef, {
                  mastered: payload.mastered,
                  hard: payload.hard,
                  updatedAt: serverTimestamp(),
                });
                if (cancelled) return;
                totalMergedFromLocal += mergedBook.addedFromSecondary;
              } catch (bookUpdateErr) {
                if (!cancelled) {
                  reportFirestoreFailure(bookUpdateErr, OperationType.UPDATE, bookDocPath);
                }
                return;
              }
            }

            commitScopedProgressTransaction(
              cfg.lsKey,
              cfg.hardKey,
              mergedBook.mastered,
              mergedBook.hard
            );
            setIrodoriProgress(prev => ({
              ...prev,
              [bookId]: { mastered: mergedBook.mastered, hard: mergedBook.hard },
            }));
            totalIrodoriMastered += mergedBook.mastered.size;
            totalIrodoriHard += mergedBook.hard.size;
          }

          const unsubBook = onSnapshot(
            bookDocRef,
            docSnap => {
              if (cancelled || !docSnap.exists()) return;
              irodoriCloudDocExistsRef.current[bookId] = true;
              const raw = docSnap.data() as {
                mastered?: unknown[];
                hard?: unknown[];
              };
              const clean = sanitizeIrodoriProgressLists(
                bookId,
                Array.isArray(raw.mastered) ? raw.mastered : [],
                Array.isArray(raw.hard) ? raw.hard : []
              );
              const nextM = new Set(clean.mastered);
              const nextH = new Set(clean.hard);
              const cur = irodoriProgressRef.current[bookId];
              if (!areSetsEqual(nextM, cur.mastered) || !areSetsEqual(nextH, cur.hard)) {
                commitScopedProgressTransaction(cfg.lsKey, cfg.hardKey, nextM, nextH);
                setStoredOwnerUid(uid);
                setIrodoriProgress(prev => ({
                  ...prev,
                  [bookId]: { mastered: nextM, hard: nextH },
                }));
              }
            },
            snapErr => {
              if (!cancelled) {
                reportFirestoreFailure(snapErr, OperationType.GET, bookDocPath);
              }
            }
          );
          unsubSnapshots.push(unsubBook);
        }

        if (cancelled) return;

        // Bootstrap & subscribe in real time via onSnapshot to all 4 quizHistory buckets
        for (const dsId of QUIZ_DATASET_IDS) {
          if (cancelled) return;
          const historyDocPath = `users/${uid}/quizHistory/${dsId}`;
          const historyDocRef = doc(db, 'users', uid, 'quizHistory', dsId);
          const storageKey = QUIZ_HISTORY_KEYS_BY_DATASET[dsId];

          let historySnap;
          try {
            historySnap = await getDoc(historyDocRef);
          } catch (historyGetErr) {
            if (!cancelled) reportFirestoreFailure(historyGetErr, OperationType.GET, historyDocPath);
            return;
          }
          if (cancelled) return;

          const localEntries = canMergeLocal ? quizHistoriesRef.current[dsId] : [];
          if (!historySnap.exists()) {
            quizHistoryCloudExistsRef.current[dsId] = false;
            quizHistoryLoadedRef.current[dsId] = true;
            if (localEntries.length > 0) {
              const payload = buildQuizHistoryWriteData(uid, dsId, localEntries);
              if (payload.sessions.length > 0) {
                try {
                  await setDoc(historyDocRef, {
                    ...payload,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  if (cancelled) return;
                  quizHistoryCloudExistsRef.current[dsId] = true;
                } catch (historyCreateErr) {
                  if (!cancelled) {
                    reportFirestoreFailure(historyCreateErr, OperationType.CREATE, historyDocPath);
                  }
                  return;
                }
              }
            }
          } else {
            quizHistoryCloudExistsRef.current[dsId] = true;
            const raw = historySnap.data() as { sessions?: unknown };
            const cloudEntries = decodeQuizHistoryFromCloud(raw.sessions, dsId);
            const { merged, needsCloudWrite } = mergeQuizHistories(cloudEntries, localEntries);

            if (!areQuizHistoriesEqual(merged, quizHistoriesRef.current[dsId])) {
              saveQuizHistory(merged, undefined, storageKey);
              quizHistoriesRef.current = { ...quizHistoriesRef.current, [dsId]: merged };
              setQuizHistories(prev => ({ ...prev, [dsId]: merged }));
            }
            quizHistoryLoadedRef.current[dsId] = true;

            if (needsCloudWrite) {
              const payload = buildQuizHistoryWriteData(uid, dsId, merged);
              try {
                await updateDoc(historyDocRef, {
                  sessions: payload.sessions,
                  updatedAt: serverTimestamp(),
                });
                if (cancelled) return;
              } catch (historyUpdateErr) {
                if (!cancelled) {
                  reportFirestoreFailure(historyUpdateErr, OperationType.UPDATE, historyDocPath);
                }
                return;
              }
            }
          }

          const unsubHistory = onSnapshot(
            historyDocRef,
            docSnap => {
              if (cancelled) return;
              if (!docSnap.exists()) {
                quizHistoryCloudExistsRef.current[dsId] = false;
                return;
              }
              quizHistoryCloudExistsRef.current[dsId] = true;
              quizHistoryLoadedRef.current[dsId] = true;
              const raw = docSnap.data() as { sessions?: unknown };
              const cloudEntries = decodeQuizHistoryFromCloud(raw.sessions, dsId);
              if (!areQuizHistoriesEqual(cloudEntries, quizHistoriesRef.current[dsId])) {
                saveQuizHistory(cloudEntries, undefined, storageKey);
                quizHistoriesRef.current = { ...quizHistoriesRef.current, [dsId]: cloudEntries };
                setQuizHistories(prev => ({ ...prev, [dsId]: cloudEntries }));
              }
            },
            snapErr => {
              if (!cancelled) {
                reportFirestoreFailure(snapErr, OperationType.GET, historyDocPath);
              }
            }
          );
          unsubSnapshots.push(unsubHistory);
        }

        if (cancelled) return;

        // Parent /users/{uid} and all real-time subcollection listeners are ready
        setCloudReadyUid(uid);

        if (justSignedInRef.current) {
          const totalMastered = n4MasteredCount + totalIrodoriMastered;
          const totalHard = n4HardCount + totalIrodoriHard;
          if (isNewCloudAccount) {
            showToast(
              'success',
              'Login Berhasil',
              totalLocalSyncedOnCreate > 0
                ? `${totalLocalSyncedOnCreate} progres lokal (N4 & Irodori) disinkronkan ke akun Anda.`
                : 'Akun terhubung. Progres N4 dan Irodori akan tersimpan otomatis ke cloud.'
            );
          } else if (totalMergedFromLocal > 0 || totalLocalSyncedOnCreate > 0) {
            const addedCount = totalMergedFromLocal + totalLocalSyncedOnCreate;
            showToast(
              'success',
              'Login & Gabung Progres Berhasil',
              `${addedCount} progres lokal digabungkan ke akun Anda.`
            );
          } else {
            showToast(
              'success',
              'Login Berhasil',
              `Progres cloud dimuat: ${totalMastered} hafal & ${totalHard} sulit (N4 + Irodori).`
            );
          }
          justSignedInRef.current = false;
        }

        const unsubUser = onSnapshot(
          userDocRef,
          docSnap => {
            if (cancelled || !docSnap.exists()) return;
            cloudDocExistsRef.current = true;
            const raw = docSnap.data() as {
              mastered?: unknown[];
              hard?: unknown[];
              displayName?: unknown;
              avatarUrl?: unknown;
              role?: unknown;
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
            setUserRole(resolveEffectiveRole(user, raw.role));
            setRoleResolved(true);
          },
          snapErr => {
            if (!cancelled) {
              reportFirestoreFailure(snapErr, OperationType.GET, docPath);
            }
          }
        );
        unsubSnapshots.push(unsubUser);
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
      unsubSnapshots.forEach(fn => fn());
    };
  }, [authReady, user, authVersion, justSignedInRef, reportFirestoreFailure, showToast]);

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
            email: normalizeEmail(currentUser.email),
            avatarUrl: sanitizeAvatarUrl(customAvatarRef.current || currentUser.photoURL),
            role: isBootstrapSuperAdminEmail(currentUser.email) ? 'superadmin' : 'user',
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

  const syncIrodoriBookToCloud = useCallback(
    async (
      uid: string,
      bookId: IrodoriBookId,
      nextMastered: Set<string>,
      nextHard: Set<string>
    ) => {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.emailVerified) return;

      if (!cloudDocExistsRef.current) {
        await syncProgressToCloud(uid, masteredRef.current, hardRef.current);
        if (!cloudDocExistsRef.current) return;
      }

      const docPath = `users/${uid}/irodoriProgress/${bookId}`;
      const bookDocRef = doc(db, 'users', uid, 'irodoriProgress', bookId);
      const payload = buildIrodoriProgressWriteData(uid, bookId, nextMastered, nextHard);
      const op = irodoriCloudDocExistsRef.current[bookId]
        ? OperationType.UPDATE
        : OperationType.CREATE;
      try {
        if (irodoriCloudDocExistsRef.current[bookId]) {
          await updateDoc(bookDocRef, {
            mastered: payload.mastered,
            hard: payload.hard,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(bookDocRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          irodoriCloudDocExistsRef.current[bookId] = true;
        }
      } catch (err) {
        reportFirestoreFailure(err, op, docPath);
      }
    },
    [reportFirestoreFailure, syncProgressToCloud]
  );

  const syncQuizHistoryWriteToCloud = useCallback(
    async (
      uid: string,
      datasetId: QuizDatasetId,
      entries: readonly QuizSessionHistoryEntry[]
    ) => {
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== uid || !currentUser.emailVerified) return;

      if (!cloudDocExistsRef.current) {
        await syncProgressToCloud(uid, masteredRef.current, hardRef.current);
        if (!cloudDocExistsRef.current) return;
      }

      const payload = buildQuizHistoryWriteData(uid, datasetId, entries);
      if (!quizHistoryCloudExistsRef.current[datasetId] && payload.sessions.length === 0) {
        return;
      }

      const docPath = `users/${uid}/quizHistory/${datasetId}`;
      const historyDocRef = doc(db, 'users', uid, 'quizHistory', datasetId);
      const op = quizHistoryCloudExistsRef.current[datasetId]
        ? OperationType.UPDATE
        : OperationType.CREATE;
      try {
        if (quizHistoryCloudExistsRef.current[datasetId]) {
          await updateDoc(historyDocRef, {
            sessions: payload.sessions,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(historyDocRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          quizHistoryCloudExistsRef.current[datasetId] = true;
        }
      } catch (err) {
        reportFirestoreFailure(err, op, docPath);
      }
    },
    [reportFirestoreFailure, syncProgressToCloud]
  );

  // Lazy per-dataset quiz history fetch: 1 single getDoc per (uid, datasetId) session, zero reads if Kuis tab isn't opened
  const fetchQuizHistoryForDataset = useCallback(
    async (uid: string, datasetId: QuizDatasetId, forceRefresh = false) => {
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== uid || !currentUser.emailVerified) return;
      if (!cloudDocExistsRef.current) return;
      if (!forceRefresh && quizHistoryLoadedRef.current[datasetId]) return;
      if (quizHistoryLoadingRef.current[datasetId]) return;

      quizHistoryLoadingRef.current[datasetId] = true;
      setQuizHistorySyncing(true);
      const docPath = `users/${uid}/quizHistory/${datasetId}`;
      const historyDocRef = doc(db, 'users', uid, 'quizHistory', datasetId);

      try {
        const snap = await getDoc(historyDocRef);
        if (auth.currentUser?.uid !== uid) return;

        const localEntries = quizHistoryCanMergeLocalRef.current
          ? quizHistoriesRef.current[datasetId]
          : [];

        if (!snap.exists()) {
          quizHistoryCloudExistsRef.current[datasetId] = false;
          quizHistoryLoadedRef.current[datasetId] = true;
          if (localEntries.length > 0) {
            await syncQuizHistoryWriteToCloud(uid, datasetId, localEntries);
          }
          return;
        }

        quizHistoryCloudExistsRef.current[datasetId] = true;
        const raw = snap.data() as { sessions?: unknown };
        const cloudEntries = decodeQuizHistoryFromCloud(raw.sessions, datasetId);
        const { merged, needsCloudWrite } = mergeQuizHistories(cloudEntries, localEntries);

        if (!areQuizHistoriesEqual(merged, quizHistoriesRef.current[datasetId])) {
          saveQuizHistory(merged, undefined, QUIZ_HISTORY_KEYS_BY_DATASET[datasetId]);
          setQuizHistories(prev => ({ ...prev, [datasetId]: merged }));
        }

        quizHistoryLoadedRef.current[datasetId] = true;
        if (needsCloudWrite) {
          await syncQuizHistoryWriteToCloud(uid, datasetId, merged);
        }
      } catch (err) {
        reportFirestoreFailure(err, OperationType.GET, docPath);
      } finally {
        quizHistoryLoadingRef.current[datasetId] = false;
        setQuizHistorySyncing(false);
      }
    },
    [reportFirestoreFailure, syncQuizHistoryWriteToCloud]
  );

  // Lazily hydrate active dataset's quiz history ONLY when user opens the Quiz tab
  useEffect(() => {
    if (activeTab !== 'quiz') return;
    if (!authReady || !user || !user.emailVerified || cloudReadyUid !== user.uid) return;
    void fetchQuizHistoryForDataset(user.uid, activeQuizDatasetId);
  }, [activeTab, activeQuizDatasetId, authReady, user, cloudReadyUid, fetchQuizHistoryForDataset]);

  const handleRecordQuizSession = useCallback(
    (datasetId: QuizDatasetId, input: RecordQuizSessionInput) => {
      const storageKey = QUIZ_HISTORY_KEYS_BY_DATASET[datasetId];
      const next = recordQuizSession(
        quizHistoriesRef.current[datasetId],
        input,
        undefined,
        storageKey
      );
      quizHistoriesRef.current = { ...quizHistoriesRef.current, [datasetId]: next };
      setQuizHistories(prev => ({ ...prev, [datasetId]: next }));
      if (user) {
        setStoredOwnerUid(user.uid);
        if (user.emailVerified) {
          if (quizHistoryLoadedRef.current[datasetId]) {
            void syncQuizHistoryWriteToCloud(user.uid, datasetId, next);
          } else {
            quizHistoryCanMergeLocalRef.current = true;
            void fetchQuizHistoryForDataset(user.uid, datasetId);
          }
        }
      }
    },
    [user, syncQuizHistoryWriteToCloud, fetchQuizHistoryForDataset]
  );

  const handleClearQuizHistory = useCallback(
    (datasetId: QuizDatasetId) => {
      const storageKey = QUIZ_HISTORY_KEYS_BY_DATASET[datasetId];
      clearQuizHistory(undefined, storageKey);
      quizHistoriesRef.current = { ...quizHistoriesRef.current, [datasetId]: [] };
      setQuizHistories(prev => ({ ...prev, [datasetId]: [] }));
      if (user && user.emailVerified && quizHistoryCloudExistsRef.current[datasetId]) {
        void syncQuizHistoryWriteToCloud(user.uid, datasetId, []);
      }
    },
    [user, syncQuizHistoryWriteToCloud]
  );

  const applyProgressChange = useCallback(
    (nextMastered: Set<string>, nextHard: Set<string>): boolean => {
      if (datasetMode === 'irodori') {
        const cfg = IRODORI_BOOKS[irodoriBookId];
        const clean = sanitizeIrodoriProgressLists(irodoriBookId, nextMastered, nextHard);
        const cleanM = new Set(clean.mastered);
        const cleanH = new Set(clean.hard);
        const tx = commitScopedProgressTransaction(cfg.lsKey, cfg.hardKey, cleanM, cleanH);
        if (!tx.ok) {
          showToast('error', 'Penyimpanan Gagal', tx.error);
          return false;
        }

        if (user) {
          setStoredOwnerUid(user.uid);
          if (user.emailVerified) {
            void syncIrodoriBookToCloud(user.uid, irodoriBookId, cleanM, cleanH);
          }
        }

        setIrodoriProgress(prev => ({
          ...prev,
          [irodoriBookId]: { mastered: cleanM, hard: cleanH },
        }));
        return true;
      }

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
    [datasetMode, irodoriBookId, showToast, user, syncProgressToCloud, syncIrodoriBookToCloud]
  );

  const handleManualSync = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || !current.emailVerified || syncing) return;
    setSyncing(true);
    try {
      await syncProgressToCloud(current.uid, masteredRef.current, hardRef.current);
      for (const bookId of IRODORI_BOOK_ORDER) {
        const bookState = irodoriProgressRef.current[bookId];
        const hasProgress = bookState.mastered.size > 0 || bookState.hard.size > 0;
        const shouldSyncBook =
          hasProgress ||
          irodoriCloudDocExistsRef.current[bookId] ||
          (datasetMode === 'irodori' && bookId === irodoriBookId);
        if (shouldSyncBook) {
          await syncIrodoriBookToCloud(
            current.uid,
            bookId,
            bookState.mastered,
            bookState.hard
          );
        }
      }
      await fetchQuizHistoryForDataset(current.uid, activeQuizDatasetId, true);
      for (const dsId of QUIZ_DATASET_IDS) {
        if (dsId === activeQuizDatasetId) continue;
        if (
          quizHistoriesRef.current[dsId].length > 0 ||
          quizHistoryCloudExistsRef.current[dsId]
        ) {
          await fetchQuizHistoryForDataset(current.uid, dsId, true);
        }
      }
      showToast(
        'success',
        'Sinkronisasi Selesai',
        'Progres & riwayat kuis JLPT N4 dan Irodori terbaru telah disinkronkan ke cloud.'
      );
    } finally {
      setSyncing(false);
    }
  }, [
    syncing,
    syncProgressToCloud,
    syncIrodoriBookToCloud,
    fetchQuizHistoryForDataset,
    activeQuizDatasetId,
    datasetMode,
    irodoriBookId,
    showToast,
  ]);

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
        bumpAuthVersion();

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
                email: normalizeEmail(current.email),
                avatarUrl: clean.avatarUrl,
                role: isBootstrapSuperAdminEmail(current.email) ? 'superadmin' : 'user',
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
    [bumpAuthVersion, reportFirestoreFailure, showToast]
  );

  const resetCloudAndLocalProgress = useCallback(() => {
    cloudDocExistsRef.current = false;
    irodoriCloudDocExistsRef.current = { pemula: false, dasar1: false, dasar2: false };
    quizHistoryCloudExistsRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
    quizHistoryLoadedRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
    quizHistoryLoadingRef.current = { n4: false, pemula: false, dasar1: false, dasar2: false };
    setCloudReadyUid(null);
    setUserRole('user');
    setRoleResolved(true);
    setCustomDisplayName('');
    setCustomAvatarUrl('');
    clearStoredProgress();
    const emptyM = new Set<string>();
    const emptyH = new Set<string>();
    setMastered(emptyM);
    setHardSet(emptyH);
    setIrodoriProgress({
      pemula: { mastered: new Set<string>(), hard: new Set<string>() },
      dasar1: { mastered: new Set<string>(), hard: new Set<string>() },
      dasar2: { mastered: new Set<string>(), hard: new Set<string>() },
    });
    setQuizHistories({ n4: [], pemula: [], dasar1: [], dasar2: [] });
    return { emptyM, emptyH };
  }, []);

  return {
    mastered,
    hardSet,
    irodoriProgress,
    quizHistories,
    activeQuizDatasetId,
    cloudReadyUid,
    userRole,
    roleResolved,
    syncing,
    quizHistorySyncing,
    fatalError,
    customDisplayName,
    customAvatarUrl,
    profileModalOpen,
    setProfileModalOpen,
    profileSaving,
    applyProgressChange,
    handleRecordQuizSession,
    handleClearQuizHistory,
    handleManualSync,
    handleSaveProfile,
    resetCloudAndLocalProgress,
  };
}
