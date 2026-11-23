import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/admin/AdminPanel';
import { AppHeader } from './components/AppHeader';
import { AuthModal } from './components/AuthModal';
import { FlashcardPanel } from './components/FlashcardPanel';
import { IrodoriBookMenu } from './components/IrodoriBookMenu';
import { IrodoriEmptyState } from './components/IrodoriEmptyState';
import { KanjiListPanel } from './components/KanjiListPanel';
import { ProfileModal } from './components/ProfileModal';
import {
  QuizPanel,
  type QuizStartedEventInput,
  type RecordQuizSessionInput,
} from './components/QuizPanel';
import { RestoreModal } from './components/RestoreModal';
import { Sidebar } from './components/Sidebar';
import { ToastBanner } from './components/ToastBanner';
import { IRODORI_BOOKS } from './data/irodoriBooks';
import { KANJI, VALID_KANJI_IDS } from './data/kanjiData';
import { useAdminMonitor } from './hooks/useAdminMonitor';
import { useAuthActions } from './hooks/useAuthActions';
import { useBackupRestore } from './hooks/useBackupRestore';
import { useCloudProgressSync } from './hooks/useCloudProgressSync';
import { useLiveActivityReporter } from './hooks/useLiveActivityReporter';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import type { QuizLiveState } from './types/admin';
import type {
  AppDatasetMode,
  AppTab,
  IrodoriBookId,
  IrodoriChapterFilter,
  IrodoriKanjiScope,
  KanjiEntry,
  LevelFilter,
  QuizDatasetId,
} from './types/kanji';
import { DATASET_SHORT_LABELS } from './utils/adminMonitor';
import {
  IRODORI_KANJI_SCOPE_META,
  countIrodoriKanjiScopes,
  matchesIrodoriKanjiScope,
} from './utils/irodoriKanjiFilter';
import { markKanjiHard, markKanjiMastered } from './utils/progressSync';
import { calculateQuizScore, getPoolIndices, shuffled } from './utils/quizEngine';
import { isAdminOrAbove } from './utils/rbac';
import { speakJP } from './utils/tts';

export default function App() {
  const [datasetMode, setDatasetMode] = useState<AppDatasetMode>('n4');
  const [irodoriBookId, setIrodoriBookId] = useState<IrodoriBookId>('dasar1');
  const [activeTab, setActiveTab] = useState<AppTab>('card');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [chapterFilter, setChapterFilter] = useState<IrodoriChapterFilter>('all');
  const [irodoriKanjiScope, setIrodoriKanjiScope] = useState<IrodoriKanjiScope>('all');

  const [hardMode, setHardMode] = useState(false);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [hideMastered, setHideMastered] = useState(false);

  const [order, setOrder] = useState<number[]>(() => getPoolIndices('all', KANJI));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionHard, setSessionHard] = useState<Set<number>>(() => new Set());
  const [sessionNewMaster, setSessionNewMaster] = useState(0);
  const [quizLiveState, setQuizLiveState] = useState<QuizLiveState | null>(null);
  const lastMilestoneLoggedRef = useRef<number>(0);

  const { toast, showToast, dismissToast } = useToast();
  const { isDark, toggleTheme } = useTheme();

  const {
    user,
    authVersion,
    authReady,
    authBusy,
    authModalOpen,
    setAuthModalOpen,
    authSwitchMode,
    authErrorText,
    authInfoText,
    authConsoleHint,
    justSignedInRef,
    bumpAuthVersion,
    clearAuthNotices,
    handleOpenAuthModal,
    handleGoogleLogin,
    handleGithubLogin,
    handleEmailSignIn,
    handleEmailSignUp,
    handleEmailReset,
    handleResendVerification,
    handleRefreshVerification,
    executeSignOut,
  } = useAuthActions({ showToast });

  const {
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
  } = useCloudProgressSync({
    user,
    authReady,
    authVersion,
    justSignedInRef,
    activeTab,
    datasetMode,
    irodoriBookId,
    bumpAuthVersion,
    showToast,
  });

  if (fatalError) {
    throw fatalError;
  }

  const activeIrodoriBook = IRODORI_BOOKS[irodoriBookId];
  const activeIrodoriProgress = irodoriProgress[irodoriBookId];
  const activeDataset: readonly KanjiEntry[] =
    datasetMode === 'irodori' ? activeIrodoriBook.data : KANJI;
  const activeMastered =
    datasetMode === 'irodori' ? activeIrodoriProgress.mastered : mastered;
  const activeHardSet =
    datasetMode === 'irodori' ? activeIrodoriProgress.hard : hardSet;
  const activeValidIds =
    datasetMode === 'irodori' ? activeIrodoriBook.validIds : VALID_KANJI_IDS;
  const activeScopeLabel =
    datasetMode === 'irodori'
      ? `${
          chapterFilter === 'all'
            ? 'Semua Bab (1–18)'
            : activeIrodoriBook.chapters[chapterFilter].label
        }${
          irodoriKanjiScope !== 'all'
            ? ` · ${IRODORI_KANJI_SCOPE_META[irodoriKanjiScope].label}`
            : ''
        }`
      : levelFilter;

  const effectiveDisplayName =
    customDisplayName || user?.displayName || user?.email?.split('@')[0] || '';
  const effectiveAvatarUrl = customAvatarUrl || user?.photoURL || '';
  const canAccessAdminPanel = Boolean(user && user.emailVerified && isAdminOrAbove(userRole));

  // Route guard: redirect out of Panel Admin/Superadmin immediately if role is revoked or user signs out
  useEffect(() => {
    if (activeTab !== 'admin') return;
    if (!authReady) return;
    if (!user || !user.emailVerified || (roleResolved && !isAdminOrAbove(userRole))) {
      setActiveTab('card');
      showToast(
        'warning',
        'Akses Panel Dibatasi',
        'Peran akun Anda tidak memiliki izin membuka Panel Pemantauan.'
      );
    }
  }, [activeTab, authReady, user, roleResolved, userRole, showToast]);

  const { logActivityEvent, totalMasteredCount } = useLiveActivityReporter({
    user,
    cloudReadyUid,
    userRole,
    displayName: effectiveDisplayName,
    avatarUrl: effectiveAvatarUrl,
    activeTab,
    datasetMode,
    irodoriBookId,
    activeScopeLabel,
    mastered,
    hardSet,
    irodoriProgress,
    quizHistories,
    quizLiveState,
  });

  const adminMonitor = useAdminMonitor({
    enabled: canAccessAdminPanel && activeTab === 'admin',
    actorUid: user?.uid ?? null,
    actorRole: userRole,
    showToast,
  });

  const handleQuizStartedEvent = useCallback(
    (input: QuizStartedEventInput) => {
      const dsLabel = DATASET_SHORT_LABELS[input.datasetId];
      void logActivityEvent({
        eventType: 'quiz_started',
        datasetId: input.datasetId,
        moduleLabel: `${dsLabel} · Kuis`,
        scopeLabel: input.scopeLabel,
        quizMode: input.mode,
        total: input.totalQuestions,
        summary: `Memulai tes ${dsLabel} (${input.totalQuestions} soal · ${input.scopeLabel})`,
      });
    },
    [logActivityEvent]
  );

  const handleRecordQuizSessionWithEvent = useCallback(
    (datasetId: QuizDatasetId, input: RecordQuizSessionInput) => {
      handleRecordQuizSession(datasetId, input);
      const score = calculateQuizScore(input.correct, input.total);
      const dsLabel = DATASET_SHORT_LABELS[datasetId];
      const scope = input.scopeLabel || `Level ${input.level}`;
      void logActivityEvent({
        eventType: 'quiz_completed',
        datasetId,
        moduleLabel: `${dsLabel} · Kuis`,
        scopeLabel: scope,
        quizMode: input.mode,
        score,
        correct: input.correct,
        total: input.total,
        summary: `Menyelesaikan tes ${dsLabel} dengan skor ${score}% (${input.correct}/${input.total})`,
      });
    },
    [handleRecordQuizSession, logActivityEvent]
  );

  const computeCardPoolFor = useCallback(
    (
      mode: AppDatasetMode,
      bookId: IrodoriBookId,
      lv: LevelFilter,
      ch: IrodoriChapterFilter,
      kanjiScope: IrodoriKanjiScope,
      hideM: boolean,
      onlyH: boolean,
      mSet: Set<string>,
      hSet: Set<string>
    ) => {
      const ds = mode === 'irodori' ? IRODORI_BOOKS[bookId].data : KANJI;
      const entryFilter =
        mode === 'irodori' && kanjiScope !== 'all'
          ? (item: KanjiEntry) => matchesIrodoriKanjiScope(item, kanjiScope)
          : undefined;
      const pool = getPoolIndices(lv, ds, mode === 'irodori' ? ch : undefined, entryFilter);
      return pool.filter(
        i => (!hideM || !mSet.has(ds[i].id)) && (!onlyH || hSet.has(ds[i].id))
      );
    },
    []
  );

  const computeCardPool = useCallback(
    (
      lv: LevelFilter,
      hideM: boolean,
      onlyH: boolean,
      mSet: Set<string>,
      hSet: Set<string>
    ) =>
      computeCardPoolFor(
        datasetMode,
        irodoriBookId,
        lv,
        chapterFilter,
        irodoriKanjiScope,
        hideM,
        onlyH,
        mSet,
        hSet
      ),
    [computeCardPoolFor, datasetMode, irodoriBookId, chapterFilter, irodoriKanjiScope]
  );

  const rebuildOrder = useCallback((indices: number[], shouldShuffle: boolean) => {
    setOrder(shouldShuffle ? shuffled(indices) : indices.slice());
    setPos(0);
    setFlipped(false);
    setSessionHard(new Set());
    setSessionNewMaster(0);
  }, []);

  const onRestoreCommitted = useCallback(
    (nextMastered: Set<string>, nextHard: Set<string>) => {
      const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, nextMastered, nextHard);
      rebuildOrder(nextPool, shuffleOn);
    },
    [computeCardPool, levelFilter, hideMastered, hardMode, rebuildOrder, shuffleOn]
  );

  const {
    pendingRestore,
    clearPendingRestore,
    restoreBtnRef,
    fileInputRef,
    restorePreviews,
    handleExport,
    handleTriggerImport,
    handleFileSelected,
    handleCloseRestoreModal,
    handleConfirmRestore,
  } = useBackupRestore({
    datasetMode,
    irodoriBookId,
    activeMastered,
    activeHardSet,
    activeValidIds,
    applyProgressChange,
    onRestoreCommitted,
    showToast,
    dismissToast,
  });

  useEffect(() => {
    if (user) {
      clearPendingRestore();
    }
  }, [user, clearPendingRestore]);

  const activeIrodoriEntryFilter = useMemo(() => {
    if (datasetMode !== 'irodori' || irodoriKanjiScope === 'all') return undefined;
    return (item: KanjiEntry) => matchesIrodoriKanjiScope(item, irodoriKanjiScope);
  }, [datasetMode, irodoriKanjiScope]);

  const irodoriKanjiScopeCounts = useMemo(() => {
    const scopeEntries =
      activeTab !== 'quiz' && chapterFilter !== 'all'
        ? activeIrodoriBook.data.filter(it => it.chapter === chapterFilter)
        : activeIrodoriBook.data;
    return countIrodoriKanjiScopes(scopeEntries);
  }, [activeIrodoriBook.data, activeTab, chapterFilter]);

  const irodoriKanjiContextLabel =
    activeTab !== 'quiz' && chapterFilter !== 'all'
      ? activeIrodoriBook.chapters[chapterFilter].label
      : undefined;

  const levelIndices = useMemo(
    () =>
      getPoolIndices(
        levelFilter,
        activeDataset,
        datasetMode === 'irodori' ? chapterFilter : undefined,
        activeIrodoriEntryFilter
      ),
    [levelFilter, activeDataset, datasetMode, chapterFilter, activeIrodoriEntryFilter]
  );
  const levelMasteredCount = useMemo(
    () => levelIndices.filter(i => activeMastered.has(activeDataset[i].id)).length,
    [levelIndices, activeMastered, activeDataset]
  );
  const levelHardCount = useMemo(
    () => levelIndices.filter(i => activeHardSet.has(activeDataset[i].id)).length,
    [levelIndices, activeHardSet, activeDataset]
  );

  const handleSignOut = useCallback(() => {
    void executeSignOut(() => {
      const { emptyM, emptyH } = resetCloudAndLocalProgress();
      const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, emptyM, emptyH);
      rebuildOrder(nextPool, shuffleOn);
    });
  }, [
    executeSignOut,
    resetCloudAndLocalProgress,
    computeCardPool,
    levelFilter,
    hideMastered,
    hardMode,
    rebuildOrder,
    shuffleOn,
  ]);

  const handleToggleDatasetMode = useCallback(() => {
    const nextMode: AppDatasetMode = datasetMode === 'n4' ? 'irodori' : 'n4';
    setDatasetMode(nextMode);
    const nextM = nextMode === 'irodori' ? activeIrodoriProgress.mastered : mastered;
    const nextH = nextMode === 'irodori' ? activeIrodoriProgress.hard : hardSet;
    const nextPool = computeCardPoolFor(
      nextMode,
      irodoriBookId,
      levelFilter,
      chapterFilter,
      irodoriKanjiScope,
      hideMastered,
      hardMode,
      nextM,
      nextH
    );
    rebuildOrder(nextPool, shuffleOn);
  }, [
    datasetMode,
    activeIrodoriProgress,
    mastered,
    hardSet,
    computeCardPoolFor,
    irodoriBookId,
    levelFilter,
    chapterFilter,
    irodoriKanjiScope,
    hideMastered,
    hardMode,
    rebuildOrder,
    shuffleOn,
  ]);

  const handleSelectIrodoriBook = useCallback(
    (nextBookId: IrodoriBookId) => {
      if (nextBookId === irodoriBookId && datasetMode === 'irodori') return;
      setIrodoriBookId(nextBookId);
      setChapterFilter('all');
      const nextBookProgress = irodoriProgress[nextBookId];
      const nextPool = computeCardPoolFor(
        'irodori',
        nextBookId,
        levelFilter,
        'all',
        irodoriKanjiScope,
        hideMastered,
        hardMode,
        nextBookProgress.mastered,
        nextBookProgress.hard
      );
      rebuildOrder(nextPool, shuffleOn);
    },
    [
      irodoriBookId,
      datasetMode,
      irodoriProgress,
      computeCardPoolFor,
      levelFilter,
      irodoriKanjiScope,
      hideMastered,
      hardMode,
      rebuildOrder,
      shuffleOn,
    ]
  );

  const handleSelectLevel = useCallback(
    (nextLevel: LevelFilter) => {
      if (nextLevel === levelFilter) return;
      setLevelFilter(nextLevel);
      const nextPool = computeCardPoolFor(
        'n4',
        irodoriBookId,
        nextLevel,
        chapterFilter,
        irodoriKanjiScope,
        hideMastered,
        hardMode,
        mastered,
        hardSet
      );
      rebuildOrder(nextPool, shuffleOn);
    },
    [
      levelFilter,
      computeCardPoolFor,
      irodoriBookId,
      chapterFilter,
      irodoriKanjiScope,
      hideMastered,
      hardMode,
      mastered,
      hardSet,
      rebuildOrder,
      shuffleOn,
    ]
  );

  const handleSelectChapter = useCallback(
    (nextChapter: IrodoriChapterFilter) => {
      if (nextChapter === chapterFilter) return;
      setChapterFilter(nextChapter);
      const nextPool = computeCardPoolFor(
        'irodori',
        irodoriBookId,
        levelFilter,
        nextChapter,
        irodoriKanjiScope,
        hideMastered,
        hardMode,
        activeIrodoriProgress.mastered,
        activeIrodoriProgress.hard
      );
      rebuildOrder(nextPool, shuffleOn);
    },
    [
      chapterFilter,
      computeCardPoolFor,
      irodoriBookId,
      levelFilter,
      irodoriKanjiScope,
      hideMastered,
      hardMode,
      activeIrodoriProgress,
      rebuildOrder,
      shuffleOn,
    ]
  );

  const handleSelectIrodoriKanjiScope = useCallback(
    (nextScope: IrodoriKanjiScope) => {
      if (nextScope === irodoriKanjiScope) return;
      setIrodoriKanjiScope(nextScope);
      const nextPool = computeCardPoolFor(
        'irodori',
        irodoriBookId,
        levelFilter,
        chapterFilter,
        nextScope,
        hideMastered,
        hardMode,
        activeIrodoriProgress.mastered,
        activeIrodoriProgress.hard
      );
      rebuildOrder(nextPool, shuffleOn);
    },
    [
      irodoriKanjiScope,
      computeCardPoolFor,
      irodoriBookId,
      levelFilter,
      chapterFilter,
      hideMastered,
      hardMode,
      activeIrodoriProgress,
      rebuildOrder,
      shuffleOn,
    ]
  );

  const handleMarkMastered = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = activeDataset[idx];
    const { nextMastered, nextHard, isNewMastered } = markKanjiMastered(
      activeMastered,
      activeHardSet,
      item.id
    );

    if (!applyProgressChange(nextMastered, nextHard)) return;
    if (isNewMastered) {
      setSessionNewMaster(v => v + 1);
      const nextTotalMastered = totalMasteredCount + 1;
      const shouldLogMilestone =
        nextTotalMastered === 1 ||
        nextTotalMastered % 5 === 0 ||
        nextTotalMastered - lastMilestoneLoggedRef.current >= 5;
      if (shouldLogMilestone) {
        lastMilestoneLoggedRef.current = nextTotalMastered;
        const dsId: QuizDatasetId = datasetMode === 'irodori' ? irodoriBookId : 'n4';
        const dsLabel = DATASET_SHORT_LABELS[dsId];
        void logActivityEvent({
          eventType: 'progress_milestone',
          datasetId: dsId,
          moduleLabel: `${dsLabel} · Kartu`,
          scopeLabel: activeScopeLabel,
          totalMastered: nextTotalMastered,
          summary: `Mencapai ${nextTotalMastered} total kosakata/kanji hafal (${dsLabel})`,
        });
      }
    }
    setPos(p => p + 1);
    setFlipped(false);
  }, [
    order,
    pos,
    activeDataset,
    activeMastered,
    activeHardSet,
    applyProgressChange,
    totalMasteredCount,
    datasetMode,
    irodoriBookId,
    activeScopeLabel,
    logActivityEvent,
  ]);

  const handleMarkHard = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = activeDataset[idx];
    const { nextMastered, nextHard } = markKanjiHard(activeMastered, activeHardSet, item.id);

    if (!applyProgressChange(nextMastered, nextHard)) return;
    setSessionHard(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setPos(p => p + 1);
    setFlipped(false);
  }, [order, pos, activeDataset, activeMastered, activeHardSet, applyProgressChange]);

  const handleForgetCurrent = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = activeDataset[idx];
    if (!activeMastered.has(item.id)) return;
    const nextM = new Set(activeMastered);
    nextM.delete(item.id);
    applyProgressChange(nextM, new Set(activeHardSet));
  }, [order, pos, activeDataset, activeMastered, activeHardSet, applyProgressChange]);

  const handleResetAllLevelMastered = useCallback(() => {
    const nextM = new Set(activeMastered);
    levelIndices.forEach(i => nextM.delete(activeDataset[i].id));
    if (applyProgressChange(nextM, new Set(activeHardSet))) {
      showToast(
        'info',
        'Hafalan Direset',
        `Data hafalan untuk ${activeScopeLabel} telah dihapus.`
      );
    }
  }, [
    activeMastered,
    activeHardSet,
    levelIndices,
    activeDataset,
    applyProgressChange,
    showToast,
    activeScopeLabel,
  ]);

  const handleUnhardCurrent = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = activeDataset[idx];
    if (!activeHardSet.has(item.id)) return;
    const nextH = new Set(activeHardSet);
    nextH.delete(item.id);
    if (!applyProgressChange(new Set(activeMastered), nextH)) return;
    setSessionHard(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }, [order, pos, activeDataset, activeMastered, activeHardSet, applyProgressChange]);

  const handleClearLevelHard = useCallback(() => {
    const nextH = new Set(activeHardSet);
    levelIndices.forEach(i => nextH.delete(activeDataset[i].id));
    if (applyProgressChange(new Set(activeMastered), nextH)) {
      setSessionHard(new Set());
      showToast(
        'info',
        'Daftar Sulit Dihapus',
        `Daftar sulit untuk ${activeScopeLabel} telah dikosongkan.`
      );
    }
  }, [
    activeHardSet,
    activeMastered,
    levelIndices,
    activeDataset,
    applyProgressChange,
    showToast,
    activeScopeLabel,
  ]);

  const handleToggleHideMastered = useCallback(() => {
    const nextHide = !hideMastered;
    setHideMastered(nextHide);
    const nextPool = computeCardPool(
      levelFilter,
      nextHide,
      hardMode,
      activeMastered,
      activeHardSet
    );
    rebuildOrder(nextPool, shuffleOn);
  }, [
    hideMastered,
    computeCardPool,
    levelFilter,
    hardMode,
    activeMastered,
    activeHardSet,
    rebuildOrder,
    shuffleOn,
  ]);

  const handleToggleShuffle = useCallback(() => {
    const nextShuffle = !shuffleOn;
    setShuffleOn(nextShuffle);
    const nextPool = computeCardPool(
      levelFilter,
      hideMastered,
      hardMode,
      activeMastered,
      activeHardSet
    );
    rebuildOrder(nextPool, nextShuffle);
  }, [
    shuffleOn,
    computeCardPool,
    levelFilter,
    hideMastered,
    hardMode,
    activeMastered,
    activeHardSet,
    rebuildOrder,
  ]);

  const handleToggleHardMode = useCallback(() => {
    const nextHardMode = !hardMode;
    setHardMode(nextHardMode);
    const nextPool = computeCardPool(
      levelFilter,
      hideMastered,
      nextHardMode,
      activeMastered,
      activeHardSet
    );
    rebuildOrder(nextPool, shuffleOn);
  }, [
    hardMode,
    computeCardPool,
    levelFilter,
    hideMastered,
    activeMastered,
    activeHardSet,
    rebuildOrder,
    shuffleOn,
  ]);

  const handleRestartSession = useCallback(() => {
    const nextPool = computeCardPool(
      levelFilter,
      hideMastered,
      hardMode,
      activeMastered,
      activeHardSet
    );
    rebuildOrder(nextPool, shuffleOn);
  }, [
    computeCardPool,
    levelFilter,
    hideMastered,
    hardMode,
    activeMastered,
    activeHardSet,
    rebuildOrder,
    shuffleOn,
  ]);

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
        const item = activeDataset[order[pos]];
        if (item) speakJP(item.r);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeTab, anyModalOpen, pos, order, activeDataset, handleMarkMastered, handleMarkHard]);

  const isIrodoriEmptyBook =
    datasetMode === 'irodori' && activeIrodoriBook.data.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <div aria-hidden={anyModalOpen} className="flex-1 flex flex-col">
        <AppHeader
          datasetMode={datasetMode}
          irodoriBookTitle={activeIrodoriBook.label}
          onToggleDatasetMode={handleToggleDatasetMode}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          masteredCount={levelMasteredCount}
          totalCount={levelIndices.length}
          restoreBtnRef={restoreBtnRef}
          fileInputRef={fileInputRef}
          user={user}
          userRole={userRole}
          displayName={effectiveDisplayName}
          avatarUrl={effectiveAvatarUrl}
          authReady={authReady}
          authBusy={authBusy}
          syncing={syncing}
          onOpenAuthModal={handleOpenAuthModal}
          onOpenProfileModal={() => setProfileModalOpen(true)}
          onOpenAdminPanel={() => {
            if (canAccessAdminPanel) setActiveTab('admin');
          }}
          onManualSync={() => void handleManualSync()}
          onResendVerification={() => void handleResendVerification()}
          onRefreshVerification={() => void handleRefreshVerification()}
          onSignOut={handleSignOut}
          onExport={handleExport}
          onTriggerImport={handleTriggerImport}
          onFileSelected={handleFileSelected}
        />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {datasetMode === 'irodori' && activeTab !== 'admin' ? (
            <IrodoriBookMenu
              selectedBookId={irodoriBookId}
              onSelectBook={handleSelectIrodoriBook}
              kanjiScope={irodoriKanjiScope}
              kanjiScopeCounts={irodoriKanjiScopeCounts}
              kanjiScopeContextLabel={irodoriKanjiContextLabel}
              onSelectKanjiScope={handleSelectIrodoriKanjiScope}
            />
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
            <Sidebar
              datasetMode={datasetMode}
              irodoriBook={activeIrodoriBook}
              activeTab={activeTab}
              userRole={canAccessAdminPanel ? userRole : 'user'}
              levelFilter={levelFilter}
              chapterFilter={chapterFilter}
              irodoriKanjiScope={irodoriKanjiScope}
              onSelectTab={setActiveTab}
              onSelectLevel={handleSelectLevel}
              onSelectChapter={handleSelectChapter}
            />

            <div className="min-w-0">
              {activeTab === 'admin' && canAccessAdminPanel && user ? (
                <AdminPanel
                  actorUid={user.uid}
                  actorRole={userRole}
                  rows={adminMonitor.rows}
                  events={adminMonitor.events}
                  kpis={adminMonitor.kpis}
                  loading={adminMonitor.loading}
                  errorMessage={adminMonitor.errorMessage}
                  hydratingLegacy={adminMonitor.hydratingLegacy}
                  hydratedCount={adminMonitor.hydratedCount}
                  legacyTotalCount={adminMonitor.legacyTotalCount}
                  nowMs={adminMonitor.nowMs}
                  roleSavingUid={adminMonitor.roleSavingUid}
                  selectedDetailRow={adminMonitor.selectedDetailRow}
                  detailData={adminMonitor.detailData}
                  detailLoading={adminMonitor.detailLoading}
                  detailError={adminMonitor.detailError}
                  onOpenUserDetail={adminMonitor.openUserDetail}
                  onCloseUserDetail={adminMonitor.closeUserDetail}
                  onUpdateRole={adminMonitor.updateUserRole}
                />
              ) : null}

              {activeTab !== 'admin' && isIrodoriEmptyBook ? (
                <IrodoriEmptyState
                  book={activeIrodoriBook}
                  onSwitchToDasar1={() => handleSelectIrodoriBook('dasar1')}
                />
              ) : null}

              {!isIrodoriEmptyBook && activeTab === 'card' ? (
                <FlashcardPanel
                  datasetMode={datasetMode}
                  dataset={activeDataset}
                  scopeLabel={activeScopeLabel}
                  levelFilter={levelFilter}
                  order={order}
                  pos={pos}
                  flipped={flipped}
                  hideMastered={hideMastered}
                  shuffleOn={shuffleOn}
                  hardMode={hardMode}
                  mastered={activeMastered}
                  hardSet={activeHardSet}
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

              {!isIrodoriEmptyBook && activeTab === 'list' ? (
                <KanjiListPanel
                  datasetMode={datasetMode}
                  irodoriBook={activeIrodoriBook}
                  levelFilter={levelFilter}
                  chapterFilter={chapterFilter}
                  irodoriKanjiScope={irodoriKanjiScope}
                  mastered={activeMastered}
                  hardSet={activeHardSet}
                />
              ) : null}

              {!isIrodoriEmptyBook && activeTab === 'quiz' ? (
                <QuizPanel
                  datasetMode={datasetMode}
                  irodoriBook={activeIrodoriBook}
                  levelFilter={levelFilter}
                  chapterFilter={chapterFilter}
                  irodoriKanjiScope={irodoriKanjiScope}
                  modalOpen={anyModalOpen}
                  quizHistory={quizHistories[activeQuizDatasetId]}
                  cloudSyncEnabled={Boolean(user && user.emailVerified)}
                  quizHistorySyncing={quizHistorySyncing}
                  onRecordQuizSession={handleRecordQuizSessionWithEvent}
                  onClearQuizHistory={handleClearQuizHistory}
                  onQuizLiveStateChange={setQuizLiveState}
                  onQuizStarted={handleQuizStartedEvent}
                />
              ) : null}
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/80 py-5 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
          {datasetMode === 'irodori'
            ? activeIrodoriBook.data.length > 0
              ? user
                ? `${activeIrodoriBook.data.length} kosakata & kanji ${activeIrodoriBook.label} (Bab 1–18) · akun ${effectiveDisplayName || user.email || 'terhubung'}${user.emailVerified ? ' (cloud aktif)' : ' (menunggu verifikasi email)'}`
                : `${activeIrodoriBook.data.length} kosakata & kanji ${activeIrodoriBook.label} (Bab 1–18) · tersimpan lokal (masuk untuk sinkronisasi cloud)`
              : `${activeIrodoriBook.label} · belum ada data materi`
            : user
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
        currentMasteredCount={activeMastered.size}
        currentHardCount={activeHardSet.size}
        mergedMasteredCount={restorePreviews.mergedMastered}
        mergedHardCount={restorePreviews.mergedHard}
        cleanBackupHardCount={restorePreviews.cleanImpHard}
        onConfirm={handleConfirmRestore}
        onClose={handleCloseRestoreModal}
      />

      <ToastBanner toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
