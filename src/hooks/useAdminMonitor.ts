import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { IRODORI_BOOKS, IRODORI_BOOK_ORDER } from '../data/irodoriBooks';
import { KANJI } from '../data/kanjiData';
import {
  OperationType,
  db,
  handleFirestoreError,
  isFirestoreQuotaError,
} from '../firebase';
import type {
  ActivityEventData,
  AdminKpiSummary,
  AdminUserRecord,
  HydratedUserStats,
  LiveActivityData,
  MonitoredUserRow,
  UserDetailData,
  UserDetailQuizEntry,
  UserModuleProgressBreakdown,
  UserRole,
} from '../types/admin';
import type { IrodoriBookId, QuizDatasetId } from '../types/kanji';
import {
  computeAdminKpis,
  extractTimestampMs,
  mergeUserMonitoringRows,
} from '../utils/adminMonitor';
import { sanitizeAvatarUrl, sanitizeDisplayName } from '../utils/progressSync';
import {
  QUIZ_DATASET_IDS,
  decodeQuizHistoryFromCloud,
  isValidQuizDatasetId,
} from '../utils/quizHistorySync';
import {
  canManageUserRole,
  isAdminOrAbove,
  isBootstrapSuperAdminEmail,
  isValidUserRole,
  normalizeEmail,
} from '../utils/rbac';
import type { ShowToastFn } from './useToast';

const LEGACY_HYDRATE_BATCH_SIZE = 5;
const EVENT_FEED_LIMIT = 60;
const PRESENCE_TICK_MS = 15_000;

interface UseAdminMonitorOptions {
  enabled: boolean;
  actorUid: string | null;
  actorRole: UserRole;
  showToast: ShowToastFn;
}

export function useAdminMonitor({
  enabled,
  actorUid,
  actorRole,
  showToast,
}: UseAdminMonitorOptions) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [liveMap, setLiveMap] = useState<Record<string, LiveActivityData>>({});
  const [events, setEvents] = useState<ActivityEventData[]>([]);
  const [hydratedMap, setHydratedMap] = useState<Record<string, HydratedUserStats>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hydratingLegacy, setHydratingLegacy] = useState(false);
  const [hydratedCount, setHydratedCount] = useState(0);
  const [legacyTotalCount, setLegacyTotalCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [roleSavingUid, setRoleSavingUid] = useState<string | null>(null);

  // Real-time UserDetailModal subscription state (100% onSnapshot)
  const [selectedDetailUid, setSelectedDetailUid] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<UserDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const hydratedUidsRef = useRef<Set<string>>(new Set());
  const hydratingInFlightRef = useRef<Set<string>>(new Set());

  const canMonitor = enabled && Boolean(actorUid) && isAdminOrAbove(actorRole);

  // Periodic clock tick so Online (2m) / Baru aktif (15m) badges & relative timestamps stay fresh
  useEffect(() => {
    if (!canMonitor) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), PRESENCE_TICK_MS);
    return () => clearInterval(timer);
  }, [canMonitor]);

  // Real-time listeners for users, liveActivity, and activityEvents
  useEffect(() => {
    if (!canMonitor) {
      setUsers([]);
      setLiveMap({});
      setEvents([]);
      setHydratedMap({});
      setLoading(false);
      setErrorMessage(null);
      setHydratingLegacy(false);
      setHydratedCount(0);
      setLegacyTotalCount(0);
      setSelectedDetailUid(null);
      setDetailData(null);
      setDetailLoading(false);
      setDetailError(null);
      hydratedUidsRef.current.clear();
      hydratingInFlightRef.current.clear();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    let usersLoaded = false;
    let liveLoaded = false;
    const markReady = () => {
      if (!cancelled && usersLoaded && liveLoaded) {
        setLoading(false);
      }
    };

    const handleSnapError = (err: unknown, path: string) => {
      if (cancelled) return;
      if (isFirestoreQuotaError(err)) {
        setErrorMessage('Kuota baca harian Firestore tercapai. Data pemantauan akan dilanjutkan besok.');
        setLoading(false);
        return;
      }
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        setErrorMessage(
          'Tidak memiliki izin atau gagal terhubung ke Firestore untuk memuat panel pemantauan.'
        );
        setLoading(false);
      }
    };

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        if (cancelled) return;
        const list: AdminUserRecord[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Record<string, unknown>;
          const email = normalizeEmail(data.email);
          const role: UserRole = isBootstrapSuperAdminEmail(email)
            ? 'superadmin'
            : isValidUserRole(data.role)
              ? data.role
              : 'user';
          return {
            uid: docSnap.id,
            displayName: sanitizeDisplayName(data.displayName),
            email,
            avatarUrl: sanitizeAvatarUrl(data.avatarUrl),
            role,
            n4MasteredCount: Array.isArray(data.mastered) ? data.mastered.length : 0,
            n4HardCount: Array.isArray(data.hard) ? data.hard.length : 0,
            createdAtMs: extractTimestampMs(data.createdAt),
            updatedAtMs: extractTimestampMs(data.updatedAt),
          };
        });
        setUsers(list);
        usersLoaded = true;
        markReady();
      },
      err => handleSnapError(err, 'users')
    );

    const unsubLive = onSnapshot(
      collection(db, 'liveActivity'),
      snapshot => {
        if (cancelled) return;
        const nextMap: Record<string, LiveActivityData> = {};
        for (const docSnap of snapshot.docs) {
          const d = docSnap.data() as Record<string, unknown>;
          const email = normalizeEmail(d.email);
          nextMap[docSnap.id] = {
            uid: docSnap.id,
            displayName: sanitizeDisplayName(d.displayName),
            email,
            avatarUrl: sanitizeAvatarUrl(d.avatarUrl),
            role: isValidUserRole(d.role) ? d.role : 'user',
            activityType: (typeof d.activityType === 'string'
              ? d.activityType
              : 'browsing') as LiveActivityData['activityType'],
            datasetMode: d.datasetMode === 'irodori' ? 'irodori' : 'n4',
            datasetId: (typeof d.datasetId === 'string'
              ? d.datasetId
              : 'n4') as QuizDatasetId,
            moduleLabel: typeof d.moduleLabel === 'string' ? d.moduleLabel : '',
            scopeLabel: typeof d.scopeLabel === 'string' ? d.scopeLabel : '',
            quizInProgress: Boolean(d.quizInProgress),
            quizCurrentQuestion:
              typeof d.quizCurrentQuestion === 'number' ? d.quizCurrentQuestion : 0,
            quizTotalQuestions:
              typeof d.quizTotalQuestions === 'number' ? d.quizTotalQuestions : 0,
            quizCorrectCount:
              typeof d.quizCorrectCount === 'number' ? d.quizCorrectCount : 0,
            quizMode: (typeof d.quizMode === 'string' ? d.quizMode : '') as LiveActivityData['quizMode'],
            totalMastered: typeof d.totalMastered === 'number' ? d.totalMastered : 0,
            totalHard: typeof d.totalHard === 'number' ? d.totalHard : 0,
            n4Mastered: typeof d.n4Mastered === 'number' ? d.n4Mastered : 0,
            irodoriMastered: typeof d.irodoriMastered === 'number' ? d.irodoriMastered : 0,
            totalQuizSessions:
              typeof d.totalQuizSessions === 'number' ? d.totalQuizSessions : 0,
            lastQuizScore: typeof d.lastQuizScore === 'number' ? d.lastQuizScore : -1,
            lastQuizTotal: typeof d.lastQuizTotal === 'number' ? d.lastQuizTotal : 0,
            lastQuizDatasetId: (typeof d.lastQuizDatasetId === 'string'
              ? d.lastQuizDatasetId
              : '') as QuizDatasetId | '',
            updatedAtMs: extractTimestampMs(d.updatedAt),
          };
        }
        setLiveMap(nextMap);
        liveLoaded = true;
        markReady();
      },
      err => handleSnapError(err, 'liveActivity')
    );

    const eventsQuery = query(
      collection(db, 'activityEvents'),
      orderBy('createdAt', 'desc'),
      limit(EVENT_FEED_LIMIT)
    );
    const unsubEvents = onSnapshot(
      eventsQuery,
      snapshot => {
        if (cancelled) return;
        const list: ActivityEventData[] = snapshot.docs.map(docSnap => {
          const d = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            uid: typeof d.uid === 'string' ? d.uid : '',
            displayName: sanitizeDisplayName(d.displayName),
            email: normalizeEmail(d.email),
            avatarUrl: sanitizeAvatarUrl(d.avatarUrl),
            eventType: (typeof d.eventType === 'string'
              ? d.eventType
              : 'progress_milestone') as ActivityEventData['eventType'],
            datasetId: (typeof d.datasetId === 'string'
              ? d.datasetId
              : 'n4') as QuizDatasetId,
            moduleLabel: typeof d.moduleLabel === 'string' ? d.moduleLabel : '',
            scopeLabel: typeof d.scopeLabel === 'string' ? d.scopeLabel : '',
            quizMode: (typeof d.quizMode === 'string' ? d.quizMode : '') as ActivityEventData['quizMode'],
            score: typeof d.score === 'number' ? d.score : -1,
            correct: typeof d.correct === 'number' ? d.correct : 0,
            total: typeof d.total === 'number' ? d.total : 0,
            totalMastered: typeof d.totalMastered === 'number' ? d.totalMastered : 0,
            summary: typeof d.summary === 'string' ? d.summary : '',
            createdAtMs: extractTimestampMs(d.createdAt),
          };
        });
        setEvents(list);
      },
      err => handleSnapError(err, 'activityEvents')
    );

    return () => {
      cancelled = true;
      unsubUsers();
      unsubLive();
      unsubEvents();
    };
  }, [canMonitor]);

  // Real-time onSnapshot subscription for the currently opened UserDetailModal
  useEffect(() => {
    if (!canMonitor || !selectedDetailUid) {
      setDetailData(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);

    let userLoaded = false;
    let irodoriLoaded = false;
    let quizLoaded = false;

    let n4MasteredCount = 0;
    let n4HardCount = 0;
    const irodoriByBook: Record<IrodoriBookId, { mastered: number; hard: number }> = {
      pemula: { mastered: 0, hard: 0 },
      dasar1: { mastered: 0, hard: 0 },
      dasar2: { mastered: 0, hard: 0 },
    };
    let quizSessions: UserDetailQuizEntry[] = [];

    const emitDetail = () => {
      if (cancelled) return;
      const modules: UserModuleProgressBreakdown[] = [
        {
          datasetId: 'n4',
          label: 'Kanji JLPT N4',
          shortLabel: 'Kanji N4',
          masteredCount: n4MasteredCount,
          hardCount: n4HardCount,
          totalItems: KANJI.length,
        },
        ...IRODORI_BOOK_ORDER.map(bookId => {
          const cfg = IRODORI_BOOKS[bookId];
          return {
            datasetId: bookId,
            label: cfg.label,
            shortLabel: cfg.shortLabel,
            masteredCount: irodoriByBook[bookId].mastered,
            hardCount: irodoriByBook[bookId].hard,
            totalItems: cfg.data.length,
          };
        }),
      ];

      const totalMastered = modules.reduce((sum, m) => sum + m.masteredCount, 0);
      const totalHard = modules.reduce((sum, m) => sum + m.hardCount, 0);

      setDetailData({
        uid: selectedDetailUid,
        modules,
        quizSessions: [...quizSessions],
        totalMastered,
        totalHard,
        totalQuizSessions: quizSessions.length,
        loadedAtMs: Date.now(),
      });

      if (userLoaded && irodoriLoaded && quizLoaded) {
        setDetailLoading(false);
      }
    };

    const handleDetailError = (err: unknown, op: OperationType, path: string) => {
      if (cancelled) return;
      if (isFirestoreQuotaError(err)) {
        setDetailError('Kuota baca harian Firestore tercapai.');
        setDetailLoading(false);
        return;
      }
      try {
        handleFirestoreError(err, op, path);
      } catch {
        setDetailError('Gagal memuat pemantauan real-time untuk rincian pengguna ini.');
        setDetailLoading(false);
      }
    };

    const unsubUserDoc = onSnapshot(
      doc(db, 'users', selectedDetailUid),
      snap => {
        if (cancelled) return;
        if (snap.exists()) {
          const d = snap.data() as { mastered?: unknown[]; hard?: unknown[] };
          n4MasteredCount = Array.isArray(d.mastered) ? d.mastered.length : 0;
          n4HardCount = Array.isArray(d.hard) ? d.hard.length : 0;
        } else {
          n4MasteredCount = 0;
          n4HardCount = 0;
        }
        userLoaded = true;
        emitDetail();
      },
      err => handleDetailError(err, OperationType.GET, `users/${selectedDetailUid}`)
    );

    const unsubIrodori = onSnapshot(
      collection(db, 'users', selectedDetailUid, 'irodoriProgress'),
      snapshot => {
        if (cancelled) return;
        for (const bookId of IRODORI_BOOK_ORDER) {
          irodoriByBook[bookId] = { mastered: 0, hard: 0 };
        }
        for (const docSnap of snapshot.docs) {
          const bookId = docSnap.id as IrodoriBookId;
          if (!IRODORI_BOOK_ORDER.includes(bookId)) continue;
          const d = docSnap.data() as { mastered?: unknown[]; hard?: unknown[] };
          irodoriByBook[bookId] = {
            mastered: Array.isArray(d.mastered) ? d.mastered.length : 0,
            hard: Array.isArray(d.hard) ? d.hard.length : 0,
          };
        }
        irodoriLoaded = true;
        emitDetail();
      },
      err =>
        handleDetailError(
          err,
          OperationType.LIST,
          `users/${selectedDetailUid}/irodoriProgress`
        )
    );

    const unsubQuiz = onSnapshot(
      collection(db, 'users', selectedDetailUid, 'quizHistory'),
      snapshot => {
        if (cancelled) return;
        const nextSessions: UserDetailQuizEntry[] = [];
        for (const docSnap of snapshot.docs) {
          if (!isValidQuizDatasetId(docSnap.id)) continue;
          const dsId = docSnap.id;
          const d = docSnap.data() as { sessions?: unknown };
          const decoded = decodeQuizHistoryFromCloud(d.sessions, dsId);
          for (const entry of decoded) {
            nextSessions.push({ ...entry, datasetId: dsId });
          }
        }
        nextSessions.sort(
          (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)
        );
        quizSessions = nextSessions;
        quizLoaded = true;
        emitDetail();
      },
      err =>
        handleDetailError(err, OperationType.LIST, `users/${selectedDetailUid}/quizHistory`)
    );

    return () => {
      cancelled = true;
      unsubUserDoc();
      unsubIrodori();
      unsubQuiz();
    };
  }, [canMonitor, selectedDetailUid]);

  // Automatic non-blocking batch hydration (5 users per batch) for legacy users without liveActivity/{uid}
  useEffect(() => {
    if (!canMonitor || users.length === 0) return;

    const legacyUids = users
      .filter(
        u =>
          !liveMap[u.uid] &&
          !hydratedUidsRef.current.has(u.uid) &&
          !hydratingInFlightRef.current.has(u.uid)
      )
      .map(u => u.uid);

    if (legacyUids.length === 0) return;

    let cancelled = false;
    setHydratingLegacy(true);
    setLegacyTotalCount(prev => Math.max(prev, hydratedUidsRef.current.size + legacyUids.length));

    const hydrateOneUser = async (uid: string): Promise<HydratedUserStats> => {
      const irodoriMasteredByBook: Record<IrodoriBookId, number> = {
        pemula: 0,
        dasar1: 0,
        dasar2: 0,
      };
      const irodoriHardByBook: Record<IrodoriBookId, number> = {
        pemula: 0,
        dasar1: 0,
        dasar2: 0,
      };

      const irodoriResults = await Promise.allSettled(
        IRODORI_BOOK_ORDER.map(bookId =>
          getDoc(doc(db, 'users', uid, 'irodoriProgress', bookId))
        )
      );
      IRODORI_BOOK_ORDER.forEach((bookId, idx) => {
        const res = irodoriResults[idx];
        if (res.status === 'fulfilled' && res.value.exists()) {
          const d = res.value.data() as { mastered?: unknown[]; hard?: unknown[] };
          irodoriMasteredByBook[bookId] = Array.isArray(d.mastered) ? d.mastered.length : 0;
          irodoriHardByBook[bookId] = Array.isArray(d.hard) ? d.hard.length : 0;
        }
      });

      const quizResults = await Promise.allSettled(
        QUIZ_DATASET_IDS.map(dsId =>
          getDoc(doc(db, 'users', uid, 'quizHistory', dsId))
        )
      );
      let totalQuizSessions = 0;
      let latestScore = -1;
      let latestTotal = 0;
      let latestDatasetId: QuizDatasetId | '' = '';
      let latestCompletedMs: number | null = null;

      QUIZ_DATASET_IDS.forEach((dsId, idx) => {
        const res = quizResults[idx];
        if (res.status === 'fulfilled' && res.value.exists()) {
          const d = res.value.data() as { sessions?: unknown };
          const decoded = decodeQuizHistoryFromCloud(d.sessions, dsId);
          totalQuizSessions += decoded.length;
          const newest = decoded[0];
          if (newest) {
            const ms = Date.parse(newest.completedAt);
            if (!Number.isNaN(ms) && (latestCompletedMs === null || ms > latestCompletedMs)) {
              latestCompletedMs = ms;
              latestScore = newest.score;
              latestTotal = newest.total;
              latestDatasetId = dsId;
            }
          }
        }
      });

      return {
        uid,
        irodoriMasteredByBook,
        irodoriHardByBook,
        irodoriMasteredTotal:
          irodoriMasteredByBook.pemula +
          irodoriMasteredByBook.dasar1 +
          irodoriMasteredByBook.dasar2,
        irodoriHardTotal:
          irodoriHardByBook.pemula +
          irodoriHardByBook.dasar1 +
          irodoriHardByBook.dasar2,
        totalQuizSessions,
        lastQuizScore: latestScore,
        lastQuizTotal: latestTotal,
        lastQuizDatasetId: latestDatasetId,
        lastQuizCompletedAtMs: latestCompletedMs,
      };
    };

    const runBatches = async () => {
      for (let i = 0; i < legacyUids.length; i += LEGACY_HYDRATE_BATCH_SIZE) {
        if (cancelled) return;
        const batch = legacyUids.slice(i, i + LEGACY_HYDRATE_BATCH_SIZE);
        batch.forEach(uid => hydratingInFlightRef.current.add(uid));

        const results = await Promise.allSettled(batch.map(uid => hydrateOneUser(uid)));
        if (cancelled) return;

        const batchUpdates: Record<string, HydratedUserStats> = {};
        results.forEach((res, idx) => {
          const uid = batch[idx];
          hydratingInFlightRef.current.delete(uid);
          if (res.status === 'fulfilled') {
            hydratedUidsRef.current.add(uid);
            batchUpdates[uid] = res.value;
          }
        });

        if (Object.keys(batchUpdates).length > 0) {
          setHydratedMap(prev => ({ ...prev, ...batchUpdates }));
          setHydratedCount(hydratedUidsRef.current.size);
        }

        await new Promise(resolve => setTimeout(resolve, 40));
      }
      if (!cancelled) {
        setHydratingLegacy(false);
      }
    };

    void runBatches();

    return () => {
      cancelled = true;
    };
  }, [canMonitor, users, liveMap]);

  const rows: MonitoredUserRow[] = useMemo(
    () => mergeUserMonitoringRows(users, liveMap, hydratedMap, nowMs),
    [users, liveMap, hydratedMap, nowMs]
  );

  const selectedDetailRow: MonitoredUserRow | null = useMemo(() => {
    if (!selectedDetailUid) return null;
    return rows.find(r => r.uid === selectedDetailUid) ?? null;
  }, [rows, selectedDetailUid]);

  const kpis: AdminKpiSummary = useMemo(() => computeAdminKpis(rows), [rows]);

  const openUserDetail = useCallback((uid: string) => {
    setSelectedDetailUid(uid);
  }, []);

  const closeUserDetail = useCallback(() => {
    setSelectedDetailUid(null);
  }, []);

  const updateUserRole = useCallback(
    async (targetRow: MonitoredUserRow, nextRole: UserRole): Promise<boolean> => {
      if (!actorUid) return false;
      const perm = canManageUserRole(
        { uid: actorUid, role: actorRole },
        { uid: targetRow.uid, email: targetRow.email }
      );
      if (!perm.allowed) {
        const reasonMsg =
          perm.reason === 'bootstrap_protected'
            ? 'Superadmin Utama dilindungi secara permanen dan tidak dapat diubah.'
            : perm.reason === 'self_protected'
              ? 'Anda tidak dapat mengubah peran akun Anda sendiri.'
              : 'Hanya Superadmin yang memiliki wewenang mengubah peran pengguna.';
        showToast('warning', 'Perubahan Ditolak', reasonMsg);
        return false;
      }

      if (targetRow.role === nextRole) return true;

      setRoleSavingUid(targetRow.uid);
      const docPath = `users/${targetRow.uid}`;
      try {
        await updateDoc(doc(db, 'users', targetRow.uid), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
        const label =
          nextRole === 'superadmin'
            ? 'Superadmin'
            : nextRole === 'admin'
              ? 'Admin (Pantau)'
              : 'Pembelajar';
        showToast(
          'success',
          'Peran Diperbarui',
          `Akses ${targetRow.displayName} sekarang menjadi ${label}.`
        );
        return true;
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        } catch {
          showToast(
            'error',
            'Gagal Mengubah Peran',
            'Operasi ditolak oleh aturan keamanan Firestore atau koneksi terganggu.'
          );
        }
        return false;
      } finally {
        setRoleSavingUid(null);
      }
    },
    [actorUid, actorRole, showToast]
  );

  return {
    rows,
    events,
    kpis,
    loading,
    errorMessage,
    hydratingLegacy,
    hydratedCount,
    legacyTotalCount,
    nowMs,
    roleSavingUid,
    selectedDetailRow,
    detailData,
    detailLoading,
    detailError,
    openUserDetail,
    closeUserDetail,
    updateUserRole,
  };
}
