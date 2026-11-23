import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { IRODORI_CHAPTER_NUMBERS } from '../data/irodoriShared';
import { KANJI, LEVELS } from '../data/kanjiData';
import type { QuizLiveState } from '../types/admin';
import type {
  AppDatasetMode,
  IrodoriBookConfig,
  IrodoriChapterFilter,
  IrodoriChapterNumber,
  IrodoriChapterSelection,
  IrodoriKanjiScope,
  KanjiEntry,
  LevelFilter,
  QuizAnswerSnapshot,
  QuizDatasetId,
  QuizOption,
  QuizQuestion,
  QuizRecord,
  QuizSessionHistoryEntry,
  QuizTypeChoice,
} from '../types/kanji';
import {
  IRODORI_KANJI_SCOPE_META,
  matchesIrodoriKanjiScope,
} from '../utils/irodoriKanjiFilter';
import {
  buildQuizBank,
  buildQuizSession,
  formatChapterSelectionLabel,
  getActiveTypeKeys,
  getPoolIndices,
} from '../utils/quizEngine';
import {
  QUIZ_HISTORY_KEY,
  buildQuizAnswerSnapshots,
  clearQuizHistory,
  computeQuizPerformanceStats,
  loadQuizHistory,
  recordQuizSession,
} from '../utils/quizStats';
import { QuizResultView } from './quiz/QuizResultView';
import { QuizRunView } from './quiz/QuizRunView';
import { QuizSetupView } from './quiz/QuizSetupView';
import { QuizStatsPanel } from './quiz/QuizStatsPanel';
import {
  PRESET_COUNTS,
  loadFuriganaPreference,
  saveFuriganaPreference,
} from './quiz/quizHelpers';

export interface RecordQuizSessionInput {
  level: LevelFilter;
  scopeLabel?: string;
  chapters?: IrodoriChapterNumber[];
  mode: QuizTypeChoice;
  correct: number;
  total: number;
  answers?: QuizAnswerSnapshot[];
}

export interface QuizStartedEventInput {
  datasetId: QuizDatasetId;
  scopeLabel: string;
  mode: QuizTypeChoice;
  totalQuestions: number;
}

interface QuizPanelProps {
  datasetMode?: AppDatasetMode;
  irodoriBook?: IrodoriBookConfig;
  levelFilter: LevelFilter;
  chapterFilter?: IrodoriChapterFilter;
  irodoriKanjiScope?: IrodoriKanjiScope;
  modalOpen: boolean;
  quizHistory?: QuizSessionHistoryEntry[];
  cloudSyncEnabled?: boolean;
  quizHistorySyncing?: boolean;
  onRecordQuizSession?: (datasetId: QuizDatasetId, input: RecordQuizSessionInput) => void;
  onClearQuizHistory?: (datasetId: QuizDatasetId) => void;
  onQuizLiveStateChange?: (state: QuizLiveState | null) => void;
  onQuizStarted?: (input: QuizStartedEventInput) => void;
}

type QuizStage = 'setup' | 'run' | 'result';

export function QuizPanel({
  datasetMode = 'n4',
  irodoriBook = IRODORI_BOOKS.dasar1,
  levelFilter,
  chapterFilter = 'all',
  irodoriKanjiScope = 'all',
  modalOpen,
  quizHistory: controlledQuizHistory,
  cloudSyncEnabled = false,
  quizHistorySyncing = false,
  onRecordQuizSession,
  onClearQuizHistory,
  onQuizLiveStateChange,
  onQuizStarted,
}: QuizPanelProps) {
  const activeDataset = datasetMode === 'irodori' ? irodoriBook.data : KANJI;
  const activeDatasetId: QuizDatasetId = datasetMode === 'irodori' ? irodoriBook.id : 'n4';
  const historyStorageKey =
    datasetMode === 'irodori' ? irodoriBook.quizHistoryKey : QUIZ_HISTORY_KEY;

  const kanjiEntryFilter = useMemo<((item: KanjiEntry) => boolean) | undefined>(() => {
    if (datasetMode !== 'irodori' || irodoriKanjiScope === 'all') return undefined;
    return (item: KanjiEntry) => matchesIrodoriKanjiScope(item, irodoriKanjiScope);
  }, [datasetMode, irodoriKanjiScope]);

  const [selectedChapters, setSelectedChapters] = useState<IrodoriChapterNumber[]>(() =>
    chapterFilter === 'all' ? [...IRODORI_CHAPTER_NUMBERS] : [chapterFilter]
  );

  const chapterCounts = useMemo(() => {
    const counts = {} as Record<IrodoriChapterNumber, number>;
    for (const ch of IRODORI_CHAPTER_NUMBERS) counts[ch] = 0;
    if (datasetMode === 'irodori') {
      for (const item of irodoriBook.data) {
        if (kanjiEntryFilter && !kanjiEntryFilter(item)) continue;
        if (item.chapter !== undefined) {
          counts[item.chapter] = (counts[item.chapter] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [datasetMode, irodoriBook.data, kanjiEntryFilter]);

  const activeChapterFilter: IrodoriChapterSelection | undefined = useMemo(() => {
    if (datasetMode !== 'irodori') return undefined;
    if (selectedChapters.length === IRODORI_CHAPTER_NUMBERS.length) return 'all';
    return selectedChapters;
  }, [datasetMode, selectedChapters]);

  const activeScopeLabel =
    datasetMode === 'irodori'
      ? `${formatChapterSelectionLabel(selectedChapters, IRODORI_CHAPTER_NUMBERS.length)}${
          irodoriKanjiScope !== 'all'
            ? ` · ${IRODORI_KANJI_SCOPE_META[irodoriKanjiScope].label}`
            : ''
        }`
      : `Level ${LEVELS[levelFilter].label}`;

  const [stage, setStage] = useState<QuizStage>('setup');
  const [quizTypeChoice, setQuizTypeChoice] = useState<QuizTypeChoice>('random');
  const [customCount, setCustomCount] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [pos, setPos] = useState(0);
  const [wrongList, setWrongList] = useState<QuizRecord[]>([]);
  const [rightList, setRightList] = useState<QuizRecord[]>([]);
  const [locked, setLocked] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [wrongFeedback, setWrongFeedback] = useState<QuizRecord | null>(null);
  const [showFurigana, setShowFurigana] = useState<boolean>(() => loadFuriganaPreference());

  const [localQuizHistory, setLocalQuizHistory] = useState<QuizSessionHistoryEntry[]>(
    () => controlledQuizHistory ?? loadQuizHistory(undefined, historyStorageKey)
  );
  const quizHistory = controlledQuizHistory ?? localQuizHistory;
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [historyModalSessionId, setHistoryModalSessionId] = useState<string | null>(null);
  const [historyAnswerFilter, setHistoryAnswerFilter] = useState<'all' | 'wrong' | 'right'>('all');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const sessionSavedRef = useRef(false);
  const activeSessionMetaRef = useRef<{
    datasetId: QuizDatasetId;
    level: LevelFilter;
    scopeLabel: string;
    chapters?: IrodoriChapterNumber[];
    mode: QuizTypeChoice;
    storageKey: string;
  }>({
    datasetId: activeDatasetId,
    level: levelFilter,
    scopeLabel: activeScopeLabel,
    chapters: datasetMode === 'irodori' ? [...selectedChapters] : undefined,
    mode: quizTypeChoice,
    storageKey: historyStorageKey,
  });

  useEffect(() => {
    if (controlledQuizHistory === undefined) {
      setLocalQuizHistory(loadQuizHistory(undefined, historyStorageKey));
    }
    setConfirmClearHistory(false);
    setHistoryModalSessionId(null);
  }, [historyStorageKey, controlledQuizHistory]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Reset back to setup and sync chapter selection when dataset mode, book, level filter, or sidebar chapter filter changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStage('setup');
    setLocked(false);
    setSelectedIdx(null);
    setWrongFeedback(null);
    setSelectedChapters(
      chapterFilter === 'all' ? [...IRODORI_CHAPTER_NUMBERS] : [chapterFilter]
    );
  }, [datasetMode, irodoriBook.id, levelFilter, chapterFilter]);

  // Reset running quiz back to setup if Kanji filter changes while preserving selected chapters
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStage('setup');
    setLocked(false);
    setSelectedIdx(null);
    setWrongFeedback(null);
  }, [irodoriKanjiScope]);

  const toggleFurigana = useCallback(() => {
    setShowFurigana(prev => {
      const next = !prev;
      saveFuriganaPreference(next);
      return next;
    });
  }, []);

  const toggleChapterSelection = useCallback((ch: IrodoriChapterNumber) => {
    setSelectedChapters(prev => {
      if (prev.includes(ch)) {
        return prev.filter(item => item !== ch);
      }
      return [...prev, ch].sort((a, b) => a - b);
    });
  }, []);

  // Persist completed quiz session once when transitioning to result stage
  useEffect(() => {
    if (stage !== 'result' || sessionSavedRef.current) return;
    const answered = rightList.length + wrongList.length;
    if (answered <= 0) return;
    sessionSavedRef.current = true;
    const { datasetId, level, scopeLabel, chapters, mode, storageKey } =
      activeSessionMetaRef.current;
    const answers = buildQuizAnswerSnapshots(rightList, wrongList);
    const input: RecordQuizSessionInput = {
      level,
      scopeLabel,
      ...(chapters ? { chapters } : {}),
      mode,
      correct: rightList.length,
      total: answered,
      answers,
    };
    if (onRecordQuizSession) {
      onRecordQuizSession(datasetId, input);
    } else {
      setLocalQuizHistory(prev => recordQuizSession(prev, input, undefined, storageKey));
    }
  }, [stage, rightList, wrongList, onRecordQuizSession]);

  // Report live quiz progress to real-time activity monitor
  useEffect(() => {
    if (!onQuizLiveStateChange) return;
    onQuizLiveStateChange({
      inProgress: stage === 'run',
      stage,
      currentQuestion: stage === 'run' ? Math.min(pos + 1, questions.length) : 0,
      totalQuestions: stage === 'run' ? questions.length : 0,
      correctCount: stage === 'run' ? rightList.length : 0,
      mode: stage === 'run' ? activeSessionMetaRef.current.mode : '',
      datasetId: activeDatasetId,
      scopeLabel:
        stage === 'run' ? activeSessionMetaRef.current.scopeLabel : activeScopeLabel,
    });
  }, [
    onQuizLiveStateChange,
    stage,
    pos,
    questions.length,
    rightList.length,
    activeDatasetId,
    activeScopeLabel,
  ]);

  useEffect(() => {
    return () => {
      onQuizLiveStateChange?.(null);
    };
  }, [onQuizLiveStateChange]);

  const performanceStats = useMemo(
    () => computeQuizPerformanceStats(quizHistory),
    [quizHistory]
  );

  const kanjiCount = useMemo(
    () => getPoolIndices(levelFilter, activeDataset, activeChapterFilter, kanjiEntryFilter).length,
    [levelFilter, activeDataset, activeChapterFilter, kanjiEntryFilter]
  );
  const modelCount = getActiveTypeKeys(quizTypeChoice).length;
  const totalBank = useMemo(
    () =>
      buildQuizBank(
        levelFilter,
        quizTypeChoice,
        activeDataset,
        activeChapterFilter,
        kanjiEntryFilter
      ).length,
    [levelFilter, quizTypeChoice, activeDataset, activeChapterFilter, kanjiEntryFilter]
  );
  const hasKanaFilteredModels = totalBank < kanjiCount * modelCount;
  const disabledPresets = PRESET_COUNTS.filter(c => c > totalBank);

  const startQuiz = useCallback(
    (requested: number | 'all') => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const session = buildQuizSession(
        levelFilter,
        quizTypeChoice,
        requested,
        activeDataset,
        Math.random,
        activeChapterFilter,
        kanjiEntryFilter
      );
      if (!session.length) return;
      sessionSavedRef.current = false;
      activeSessionMetaRef.current = {
        datasetId: activeDatasetId,
        level: levelFilter,
        scopeLabel: activeScopeLabel,
        chapters: datasetMode === 'irodori' ? [...selectedChapters] : undefined,
        mode: quizTypeChoice,
        storageKey: historyStorageKey,
      };
      setConfirmClearHistory(false);
      setQuestions(session);
      setPos(0);
      setWrongList([]);
      setRightList([]);
      setLocked(false);
      setSelectedIdx(null);
      setWrongFeedback(null);
      setStage('run');
      onQuizStarted?.({
        datasetId: activeDatasetId,
        scopeLabel: activeScopeLabel,
        mode: quizTypeChoice,
        totalQuestions: session.length,
      });
    },
    [
      activeDatasetId,
      datasetMode,
      selectedChapters,
      levelFilter,
      quizTypeChoice,
      activeDataset,
      activeChapterFilter,
      kanjiEntryFilter,
      activeScopeLabel,
      historyStorageKey,
      onQuizStarted,
    ]
  );

  const advanceToNextQuestion = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLocked(false);
    setSelectedIdx(null);
    setWrongFeedback(null);
    if (pos + 1 < questions.length) {
      setPos(p => p + 1);
    } else {
      setStage('result');
    }
  }, [pos, questions.length]);

  const handleAnswer = useCallback(
    (optObj: QuizOption, optIdx: number) => {
      if (locked) return;
      const q = questions[pos];
      if (!q) return;

      setLocked(true);
      setSelectedIdx(optIdx);

      const isCorrect = optObj.item.id === q.item.id;
      const rec: QuizRecord = {
        no: pos + 1,
        item: q.item,
        type: q.type,
        exMeta: q.exMeta,
        chosen: optObj.item,
        chosenLabel: optObj.label,
      };

      if (isCorrect) {
        setRightList(prev => [...prev, rec]);
        setWrongFeedback(null);
        timerRef.current = setTimeout(() => {
          setLocked(false);
          setSelectedIdx(null);
          if (pos + 1 < questions.length) {
            setPos(p => p + 1);
          } else {
            setStage('result');
          }
        }, 420);
      } else {
        setWrongList(prev => [...prev, rec]);
        setWrongFeedback(rec);
      }
    },
    [locked, pos, questions]
  );

  // Keyboard shortcuts A-D or 1-4 while quiz is running, plus Enter/Space to continue after wrong feedback
  useEffect(() => {
    if (stage !== 'run' || modalOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (wrongFeedback && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        advanceToNextQuestion();
        return;
      }

      let optIdx = -1;
      if (/^[1-4]$/.test(e.key)) {
        optIdx = Number(e.key) - 1;
      } else if (/^[a-dA-D]$/.test(e.key)) {
        optIdx = e.key.toUpperCase().charCodeAt(0) - 65;
      }

      if (optIdx >= 0 && !locked) {
        const q = questions[pos];
        const opt = q?.options[optIdx];
        if (opt) {
          e.preventDefault();
          handleAnswer(opt, optIdx);
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [stage, modalOpen, locked, wrongFeedback, questions, pos, handleAnswer, advanceToNextQuestion]);

  const openAnswerHistoryModal = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId ?? quizHistory[0]?.id ?? null;
      if (!targetId) return;
      setHistoryAnswerFilter('all');
      setHistoryModalSessionId(targetId);
    },
    [quizHistory]
  );

  const handleConfirmClearHistory = useCallback(() => {
    if (onClearQuizHistory) {
      onClearQuizHistory(activeDatasetId);
    } else {
      setLocalQuizHistory(clearQuizHistory(undefined, historyStorageKey));
    }
    setConfirmClearHistory(false);
    setHistoryModalSessionId(null);
  }, [onClearQuizHistory, activeDatasetId, historyStorageKey]);

  const handleFinishEarly = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setWrongFeedback(null);
    if (rightList.length + wrongList.length === 0) {
      setStage('setup');
    } else {
      setStage('result');
    }
  }, [rightList.length, wrongList.length]);

  const performancePanel = (
    <QuizStatsPanel
      datasetMode={datasetMode}
      irodoriBook={irodoriBook}
      quizHistory={quizHistory}
      performanceStats={performanceStats}
      cloudSyncEnabled={cloudSyncEnabled}
      quizHistorySyncing={quizHistorySyncing}
      confirmClearHistory={confirmClearHistory}
      historyModalSessionId={historyModalSessionId}
      historyAnswerFilter={historyAnswerFilter}
      onRequestClearHistory={setConfirmClearHistory}
      onConfirmClearHistory={handleConfirmClearHistory}
      onOpenAnswerHistory={openAnswerHistoryModal}
      onSelectHistorySession={id => {
        setHistoryModalSessionId(id);
        setHistoryAnswerFilter('all');
      }}
      onSelectHistoryFilter={setHistoryAnswerFilter}
      onCloseAnswerHistory={() => setHistoryModalSessionId(null)}
    />
  );

  if (stage === 'setup') {
    return (
      <QuizSetupView
        datasetMode={datasetMode}
        irodoriBook={irodoriBook}
        irodoriKanjiScope={irodoriKanjiScope}
        selectedChapters={selectedChapters}
        chapterCounts={chapterCounts}
        quizTypeChoice={quizTypeChoice}
        showFurigana={showFurigana}
        activeScopeLabel={activeScopeLabel}
        kanjiCount={kanjiCount}
        modelCount={modelCount}
        totalBank={totalBank}
        hasKanaFilteredModels={hasKanaFilteredModels}
        disabledPresets={disabledPresets}
        customCount={customCount}
        customInputRef={customInputRef}
        onSelectChapters={setSelectedChapters}
        onToggleChapter={toggleChapterSelection}
        onSelectQuizType={setQuizTypeChoice}
        onToggleFurigana={toggleFurigana}
        onCustomCountChange={setCustomCount}
        onStartQuiz={startQuiz}
        performancePanel={performancePanel}
      />
    );
  }

  if (stage === 'run') {
    const q = questions[pos];
    if (!q) return null;
    return (
      <QuizRunView
        datasetMode={datasetMode}
        question={q}
        pos={pos}
        totalQuestions={questions.length}
        locked={locked}
        selectedIdx={selectedIdx}
        wrongFeedback={wrongFeedback}
        showFurigana={showFurigana}
        onToggleFurigana={toggleFurigana}
        onFinishEarly={handleFinishEarly}
        onAnswer={handleAnswer}
        onAdvanceAfterWrong={advanceToNextQuestion}
      />
    );
  }

  return (
    <QuizResultView
      datasetMode={datasetMode}
      quizTypeChoice={quizTypeChoice}
      rightList={rightList}
      wrongList={wrongList}
      onPlayAgain={() => setStage('setup')}
      performancePanel={performancePanel}
    />
  );
}
