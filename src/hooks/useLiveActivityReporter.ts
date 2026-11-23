import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { IRODORI_BOOKS } from '../data/irodoriBooks';
import {
  OperationType,
  db,
  handleFirestoreError,
  isFirestoreQuotaError,
} from '../firebase';
import type {
  ActivityEventType,
  LiveActivityType,
  QuizLiveState,
  UserRole,
} from '../types/admin';
import type {
  AppDatasetMode,
  AppTab,
  IrodoriBookId,
  QuizDatasetId,
  QuizSessionHistoryEntry,
  QuizTypeChoice,
} from '../types/kanji';
import { DATASET_SHORT_LABELS } from '../utils/adminMonitor';
import { encodeLiveQuizLog, encodeLiveQuizToken } from '../utils/liveQuizSync';
import { sanitizeAvatarUrl, sanitizeDisplayName } from '../utils/progressSync';
import {
  EVENT_SUMMARY_MAX_LENGTH,
  MODULE_LABEL_MAX_LENGTH,
  SCOPE_LABEL_MAX_LENGTH,
  clampInt,
  normalizeEmail,
  sanitizeBoundedText,
} from '../utils/rbac';
import type { IrodoriProgressMap } from './useCloudProgressSync';

const DEBOUNCE_NAV_MS = 500;
const DEBOUNCE_LIVE_MS = 40;
const HEARTBEAT_INTERVAL_MS = 60_000;

interface UseLiveActivityReporterOptions {
  user: User | null;
  cloudReadyUid: string | null;
  userRole: UserRole;
  displayName: string;
  avatarUrl: string;
  activeTab: AppTab;
  datasetMode: AppDatasetMode;
  irodoriBookId: IrodoriBookId;
  activeScopeLabel: string;
  mastered: Set<string>;
  hardSet: Set<string>;
  irodoriProgress: IrodoriProgressMap;
  quizHistories: Record<QuizDatasetId, QuizSessionHistoryEntry[]>;
  quizLiveState: QuizLiveState | null;
}

export interface LogActivityEventInput {
  eventType: ActivityEventType;
  datasetId: QuizDatasetId;
  moduleLabel: string;
  scopeLabel: string;
  quizMode?: QuizTypeChoice | '';
  score?: number;
  correct?: number;
  total?: number;
  totalMastered?: number;
  summary: string;
}

function generateEventId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ev_${Date.now()}_${rand}`;
}

export function useLiveActivityReporter({
  user,
  cloudReadyUid,
  userRole,
  displayName,
  avatarUrl,
  activeTab,
  datasetMode,
  irodoriBookId,
  activeScopeLabel,
  mastered,
  hardSet,
  irodoriProgress,
  quizHistories,
  quizLiveState,
}: UseLiveActivityReporterOptions) {
  const isEnabled = Boolean(user && user.emailVerified && cloudReadyUid === user.uid);

  const statsSummary = useMemo(() => {
    const n4Mastered = mastered.size;
    const irodoriMastered =
      irodoriProgress.pemula.mastered.size +
      irodoriProgress.dasar1.mastered.size +
      irodoriProgress.dasar2.mastered.size;
    const totalMastered = n4Mastered + irodoriMastered;
    const totalHard =
      hardSet.size +
      irodoriProgress.pemula.hard.size +
      irodoriProgress.dasar1.hard.size +
      irodoriProgress.dasar2.hard.size;

    const allSessions: Array<{ datasetId: QuizDatasetId; entry: QuizSessionHistoryEntry }> = [];
    (Object.keys(quizHistories) as QuizDatasetId[]).forEach(dsId => {
      for (const entry of quizHistories[dsId]) {
        allSessions.push({ datasetId: dsId, entry });
      }
    });
    allSessions.sort(
      (a, b) => Date.parse(b.entry.completedAt) - Date.parse(a.entry.completedAt)
    );
    const latest = allSessions[0];

    return {
      n4Mastered,
      irodoriMastered,
      totalMastered,
      totalHard,
      totalQuizSessions: allSessions.length,
      lastQuizScore: latest ? clampInt(latest.entry.score, 0, 100) : -1,
      lastQuizTotal: latest ? clampInt(latest.entry.total, 0, 500) : 0,
      lastQuizDatasetId: (latest?.datasetId ?? '') as QuizDatasetId | '',
    };
  }, [mastered, hardSet, irodoriProgress, quizHistories]);

  const currentDatasetId: QuizDatasetId =
    datasetMode === 'irodori' ? irodoriBookId : 'n4';

  const activityMeta = useMemo(() => {
    let activityType: LiveActivityType = 'browsing';
    let moduleLabel = '';

    if (activeTab === 'admin') {
      activityType = 'admin_panel';
      moduleLabel = userRole === 'superadmin' ? 'Panel Superadmin' : 'Panel Admin';
    } else if (activeTab === 'card') {
      activityType = 'flashcard';
      moduleLabel =
        datasetMode === 'irodori'
          ? `${IRODORI_BOOKS[irodoriBookId].label} · Kartu`
          : 'Kanji N4 · Kartu';
    } else if (activeTab === 'list') {
      activityType = 'list';
      moduleLabel =
        datasetMode === 'irodori'
          ? `${IRODORI_BOOKS[irodoriBookId].label} · Daftar`
          : 'Kanji N4 · Daftar';
    } else if (activeTab === 'quiz') {
      const stage = quizLiveState?.stage ?? 'setup';
      activityType =
        stage === 'run'
          ? 'quiz_running'
          : stage === 'result'
            ? 'quiz_result'
            : 'quiz_setup';
      moduleLabel = `${DATASET_SHORT_LABELS[currentDatasetId]} · Kuis`;
    }

    const quizInProgress = Boolean(
      activeTab === 'quiz' && quizLiveState?.inProgress && quizLiveState.stage === 'run'
    );
    const keepLiveQuizLog = Boolean(
      activeTab === 'quiz' &&
        (quizInProgress || quizLiveState?.stage === 'result')
    );

    const liveDatasetId: QuizDatasetId =
      activeTab === 'quiz' && quizLiveState?.datasetId
        ? quizLiveState.datasetId
        : currentDatasetId;

    const quizCurrentToken = quizInProgress
      ? encodeLiveQuizToken(quizLiveState?.currentQuestionSnapshot, liveDatasetId)
      : '';
    const quizLiveLog = keepLiveQuizLog
      ? encodeLiveQuizLog(quizLiveState?.answeredLog, liveDatasetId)
      : '';

    return {
      activityType,
      datasetId: liveDatasetId,
      moduleLabel: sanitizeBoundedText(moduleLabel, MODULE_LABEL_MAX_LENGTH),
      scopeLabel: sanitizeBoundedText(
        quizLiveState?.scopeLabel && activeTab === 'quiz'
          ? quizLiveState.scopeLabel
          : activeScopeLabel,
        SCOPE_LABEL_MAX_LENGTH
      ),
      quizInProgress,
      quizCurrentQuestion: quizInProgress
        ? clampInt(quizLiveState?.currentQuestion ?? 0, 0, 500)
        : 0,
      quizTotalQuestions: quizInProgress
        ? clampInt(quizLiveState?.totalQuestions ?? 0, 0, 500)
        : 0,
      quizCorrectCount: quizInProgress
        ? clampInt(quizLiveState?.correctCount ?? 0, 0, 500)
        : 0,
      quizMode: (quizInProgress ? quizLiveState?.mode ?? '' : '') as QuizTypeChoice | '',
      quizCurrentToken,
      quizLiveLog,
    };
  }, [activeTab, userRole, datasetMode, irodoriBookId, currentDatasetId, activeScopeLabel, quizLiveState]);

  const payloadRef = useRef<{
    uid: string;
    data: Record<string, unknown>;
  } | null>(null);

  const builtPayload = useMemo(() => {
    if (!isEnabled || !user) return null;
    return {
      uid: user.uid,
      displayName: sanitizeDisplayName(displayName || user.displayName),
      email: normalizeEmail(user.email),
      avatarUrl: sanitizeAvatarUrl(avatarUrl || user.photoURL),
      role: userRole,
      activityType: activityMeta.activityType,
      datasetMode,
      datasetId: activityMeta.datasetId,
      moduleLabel: activityMeta.moduleLabel,
      scopeLabel: activityMeta.scopeLabel,
      quizInProgress: activityMeta.quizInProgress,
      quizCurrentQuestion: activityMeta.quizCurrentQuestion,
      quizTotalQuestions: activityMeta.quizTotalQuestions,
      quizCorrectCount: activityMeta.quizCorrectCount,
      quizMode: activityMeta.quizMode,
      quizCurrentToken: activityMeta.quizCurrentToken,
      quizLiveLog: activityMeta.quizLiveLog,
      totalMastered: clampInt(statsSummary.totalMastered, 0, 5000),
      totalHard: clampInt(statsSummary.totalHard, 0, 5000),
      n4Mastered: clampInt(statsSummary.n4Mastered, 0, 500),
      irodoriMastered: clampInt(statsSummary.irodoriMastered, 0, 4000),
      totalQuizSessions: clampInt(statsSummary.totalQuizSessions, 0, 5000),
      lastQuizScore: clampInt(statsSummary.lastQuizScore, -1, 100),
      lastQuizTotal: clampInt(statsSummary.lastQuizTotal, 0, 500),
      lastQuizDatasetId: statsSummary.lastQuizDatasetId,
    };
  }, [
    isEnabled,
    user,
    displayName,
    avatarUrl,
    userRole,
    activityMeta,
    datasetMode,
    currentDatasetId,
    statsSummary,
  ]);

  payloadRef.current =
    isEnabled && user && builtPayload ? { uid: user.uid, data: builtPayload } : null;

  const pushLiveActivityNow = useCallback(async () => {
    const current = payloadRef.current;
    if (!current) return;
    const docPath = `liveActivity/${current.uid}`;
    try {
      await setDoc(doc(db, 'liveActivity', current.uid), {
        ...current.data,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (isFirestoreQuotaError(err)) return;
      try {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      } catch {
        // Non-blocking telemetry failure: logged via handleFirestoreError without disrupting study flow
      }
    }
  }, []);

  // Immediate initial sync on login + fast debounced sync on state changes
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPushedUidRef = useRef<string | null>(null);
  const serializedKey = useMemo(
    () => (builtPayload ? JSON.stringify(builtPayload) : ''),
    [builtPayload]
  );

  useEffect(() => {
    if (!isEnabled || !user || !serializedKey) {
      if (!user) initialPushedUidRef.current = null;
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (initialPushedUidRef.current !== user.uid) {
      initialPushedUidRef.current = user.uid;
      void pushLiveActivityNow();
      return;
    }

    const isUrgent =
      activityMeta.quizInProgress ||
      activityMeta.activityType === 'quiz_result';
    const delay = isUrgent ? DEBOUNCE_LIVE_MS : DEBOUNCE_NAV_MS;
    debounceTimerRef.current = setTimeout(() => {
      void pushLiveActivityNow();
    }, delay);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    isEnabled,
    user,
    serializedKey,
    activityMeta.quizInProgress,
    activityMeta.activityType,
    pushLiveActivityNow,
  ]);

  // Lightweight 60s heartbeat & visibility refresh
  useEffect(() => {
    if (!isEnabled) return;

    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void pushLiveActivityNow();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pushLiveActivityNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isEnabled, pushLiveActivityNow]);

  // Append-only chronological event logger (/activityEvents/{eventId})
  const logActivityEvent = useCallback(
    async (input: LogActivityEventInput) => {
      if (!isEnabled || !user) return;
      const eventId = generateEventId();
      const docPath = `activityEvents/${eventId}`;
      const summary = sanitizeBoundedText(input.summary, EVENT_SUMMARY_MAX_LENGTH);
      if (!summary) return;

      try {
        await setDoc(doc(db, 'activityEvents', eventId), {
          uid: user.uid,
          displayName: sanitizeDisplayName(displayName || user.displayName),
          email: normalizeEmail(user.email),
          avatarUrl: sanitizeAvatarUrl(avatarUrl || user.photoURL),
          eventType: input.eventType,
          datasetId: input.datasetId,
          moduleLabel: sanitizeBoundedText(input.moduleLabel, MODULE_LABEL_MAX_LENGTH),
          scopeLabel: sanitizeBoundedText(input.scopeLabel, SCOPE_LABEL_MAX_LENGTH),
          quizMode: input.quizMode ?? '',
          score: clampInt(input.score ?? -1, -1, 100),
          correct: clampInt(input.correct ?? 0, 0, 500),
          total: clampInt(input.total ?? 0, 0, 500),
          totalMastered: clampInt(
            input.totalMastered ?? statsSummary.totalMastered,
            0,
            5000
          ),
          summary,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        if (isFirestoreQuotaError(err)) return;
        try {
          handleFirestoreError(err, OperationType.CREATE, docPath);
        } catch {
          // Non-blocking audit log failure: logged via handleFirestoreError
        }
      }
    },
    [isEnabled, user, displayName, avatarUrl, statsSummary.totalMastered]
  );

  return {
    logActivityEvent,
    totalMasteredCount: statsSummary.totalMastered,
  };
}
