import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { KANJI, LEVELS } from '../data/kanjiData';
import type {
  AppDatasetMode,
  IrodoriBookConfig,
  IrodoriChapterFilter,
  LevelFilter,
  QuizOption,
  QuizQuestion,
  QuizRecord,
  QuizSessionHistoryEntry,
  QuizTypeChoice,
} from '../types/kanji';
import {
  ABC_LABELS,
  QTYPES,
  buildQuizSession,
  calculateQuizScore,
  getActiveTypeKeys,
  getPoolIndices,
} from '../utils/quizEngine';
import {
  QUIZ_HISTORY_KEY,
  clearQuizHistory,
  computeQuizPerformanceStats,
  loadQuizHistory,
  recordQuizSession,
} from '../utils/quizStats';

interface QuizPanelProps {
  datasetMode?: AppDatasetMode;
  irodoriBook?: IrodoriBookConfig;
  levelFilter: LevelFilter;
  chapterFilter?: IrodoriChapterFilter;
  modalOpen: boolean;
}

const PRESET_COUNTS = [10, 20, 50, 100, 500] as const;

const QUIZ_TYPE_OPTIONS: { key: QuizTypeChoice; short: string; label: string; fullWidth?: boolean }[] = [
  { key: 'random', short: 'Acak 4', label: 'Acak (4 Model Utama)' },
  { key: 'random5', short: 'Acak 5', label: 'Acak Semua (+Kalimat)' },
  { key: 'k2r', short: '漢→あ', label: 'Kanji → Hiragana' },
  { key: 'k2m', short: '漢→ID', label: 'Kanji → Arti' },
  { key: 'm2k', short: 'ID→漢', label: 'Arti → Kanji' },
  { key: 'r2k', short: 'あ→漢', label: 'Hiragana → Kanji' },
  {
    key: 'ex2k',
    short: '📖→漢',
    label: 'Contoh Kalimat → Kanji (Sesuai Konjugasi)',
    fullWidth: true,
  },
];

type QuizStage = 'setup' | 'run' | 'result';

const MODE_SHORT_LABEL: Record<QuizTypeChoice, string> = {
  random: 'Acak 4',
  random5: 'Acak 5',
  k2r: '漢→あ',
  k2m: '漢→ID',
  m2k: 'ID→漢',
  r2k: 'あ→漢',
  ex2k: '📖→漢',
};

function formatQuizTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function QuizPanel({
  datasetMode = 'n4',
  irodoriBook = IRODORI_BOOKS.dasar1,
  levelFilter,
  chapterFilter = 'all',
  modalOpen,
}: QuizPanelProps) {
  const activeDataset = datasetMode === 'irodori' ? irodoriBook.data : KANJI;
  const activeChapterFilter = datasetMode === 'irodori' ? chapterFilter : undefined;
  const historyStorageKey =
    datasetMode === 'irodori' ? irodoriBook.quizHistoryKey : QUIZ_HISTORY_KEY;

  const activeScopeLabel =
    datasetMode === 'irodori'
      ? chapterFilter === 'all'
        ? 'Semua Bab (1–18)'
        : irodoriBook.chapters[chapterFilter].label
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

  const [quizHistory, setQuizHistory] = useState<QuizSessionHistoryEntry[]>(() =>
    loadQuizHistory(undefined, historyStorageKey)
  );
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const sessionSavedRef = useRef(false);
  const activeSessionMetaRef = useRef<{
    level: LevelFilter;
    scopeLabel: string;
    mode: QuizTypeChoice;
    storageKey: string;
  }>({
    level: levelFilter,
    scopeLabel: activeScopeLabel,
    mode: quizTypeChoice,
    storageKey: historyStorageKey,
  });

  useEffect(() => {
    setQuizHistory(loadQuizHistory(undefined, historyStorageKey));
    setConfirmClearHistory(false);
  }, [historyStorageKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Reset back to setup when dataset mode, book, level filter, or chapter filter changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStage('setup');
    setLocked(false);
    setSelectedIdx(null);
  }, [datasetMode, irodoriBook.id, levelFilter, chapterFilter]);

  // Persist completed quiz session once when transitioning to result stage
  useEffect(() => {
    if (stage !== 'result' || sessionSavedRef.current) return;
    const answered = rightList.length + wrongList.length;
    if (answered <= 0) return;
    sessionSavedRef.current = true;
    const { level, scopeLabel, mode, storageKey } = activeSessionMetaRef.current;
    setQuizHistory(prev =>
      recordQuizSession(
        prev,
        {
          level,
          scopeLabel,
          mode,
          correct: rightList.length,
          total: answered,
        },
        undefined,
        storageKey
      )
    );
  }, [stage, rightList.length, wrongList.length]);

  const performanceStats = useMemo(
    () => computeQuizPerformanceStats(quizHistory),
    [quizHistory]
  );

  const kanjiCount = useMemo(
    () => getPoolIndices(levelFilter, activeDataset, activeChapterFilter).length,
    [levelFilter, activeDataset, activeChapterFilter]
  );
  const modelCount = getActiveTypeKeys(quizTypeChoice).length;
  const totalBank = kanjiCount * modelCount;
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
        activeChapterFilter
      );
      if (!session.length) return;
      sessionSavedRef.current = false;
      activeSessionMetaRef.current = {
        level: levelFilter,
        scopeLabel: activeScopeLabel,
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
      setStage('run');
    },
    [levelFilter, quizTypeChoice, activeDataset, activeChapterFilter, activeScopeLabel, historyStorageKey]
  );

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
      } else {
        setWrongList(prev => [...prev, rec]);
      }

      timerRef.current = setTimeout(
        () => {
          setLocked(false);
          setSelectedIdx(null);
          if (pos + 1 < questions.length) {
            setPos(p => p + 1);
          } else {
            setStage('result');
          }
        },
        isCorrect ? 420 : 850
      );
    },
    [locked, pos, questions]
  );

  // Keyboard shortcuts A-D or 1-4 while quiz is running
  useEffect(() => {
    if (stage !== 'run' || modalOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
  }, [stage, modalOpen, locked, questions, pos, handleAnswer]);

  const recentScores = quizHistory.slice(0, 6);

  const performancePanel = (
    <div
      id="quizStatsPanel"
      className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
          <span>Statistik Performa Kuis</span>
        </h3>

        {quizHistory.length > 0 ? (
          confirmClearHistory ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btnConfirmClearQuizStats"
                onClick={() => {
                  setQuizHistory(clearQuizHistory(undefined, historyStorageKey));
                  setConfirmClearHistory(false);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                Ya, Hapus
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearHistory(false)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="btnClearQuizStats"
              onClick={() => setConfirmClearHistory(true)}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-500 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Hapus Riwayat</span>
            </button>
          )
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
          <div className="text-xs font-semibold text-slate-500">Persentase Jawaban Benar</div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              id="quizStatAccuracy"
              className="text-2xl font-extrabold text-emerald-700 font-mono-num"
            >
              {performanceStats.overallAccuracyPct}%
            </span>
            <span className="text-xs font-medium text-slate-600 font-mono-num">
              {performanceStats.totalCorrect}/{performanceStats.totalAnswered} benar
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-300"
              style={{ width: `${performanceStats.overallAccuracyPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500">Skor Terakhir</div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              id="quizStatLatest"
              className="text-2xl font-extrabold text-indigo-700 font-mono-num"
            >
              {performanceStats.latestScore !== null ? `${performanceStats.latestScore}%` : '—'}
            </span>
            {performanceStats.trendDelta !== null ? (
              <span
                className={`text-xs font-bold font-mono-num inline-flex items-center gap-0.5 ${
                  performanceStats.trendDelta > 0
                    ? 'text-emerald-700'
                    : performanceStats.trendDelta < 0
                      ? 'text-rose-700'
                      : 'text-slate-500'
                }`}
              >
                {performanceStats.trendDelta > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : performanceStats.trendDelta < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                ) : null}
                <span>
                  {performanceStats.trendDelta > 0
                    ? `+${performanceStats.trendDelta}%`
                    : `${performanceStats.trendDelta}%`}
                </span>
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                {performanceStats.totalSessions === 1 ? 'Sesi pertama' : 'Belum ada sesi'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {performanceStats.trendDelta !== null
              ? 'Dibanding skor kuis sebelumnya'
              : 'Selesaikan kuis untuk melihat tren'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500">Skor Terbaik</div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              id="quizStatBest"
              className="text-2xl font-extrabold text-slate-900 font-mono-num"
            >
              {performanceStats.totalSessions > 0 ? `${performanceStats.bestScore}%` : '—'}
            </span>
            <span className="text-xs font-medium text-slate-600 font-mono-num">
              {performanceStats.totalSessions} sesi
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Rekor akurasi tertinggi yang tersimpan
          </p>
        </div>
      </div>

      {recentScores.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Riwayat Skor Terakhir
          </div>
          <ul id="quizRecentHistory" className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {recentScores.map(entry => {
              const barColor =
                entry.score >= 80
                  ? 'bg-emerald-600'
                  : entry.score >= 60
                    ? 'bg-indigo-600'
                    : 'bg-amber-500';
              const textColor =
                entry.score >= 80
                  ? 'text-emerald-700'
                  : entry.score >= 60
                    ? 'text-indigo-700'
                    : 'text-amber-700';

              return (
                <li
                  key={entry.id}
                  className="px-3.5 py-2.5 bg-white flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-jp font-bold text-slate-900 shrink-0">
                      {MODE_SHORT_LABEL[entry.mode]}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-600 font-medium">
                      {entry.scopeLabel ?? `Level ${LEVELS[entry.level].label}`}
                    </span>
                    <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-500 hidden sm:inline">
                      {formatQuizTimestamp(entry.completedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 ml-auto shrink-0">
                    <span className="text-xs text-slate-600 font-mono-num">
                      {entry.correct}/{entry.total}
                    </span>
                    <div
                      className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${entry.score}%` }}
                      />
                    </div>
                    <span className={`font-bold font-mono-num w-10 text-right ${textColor}`}>
                      {entry.score}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          Belum ada riwayat skor. Selesaikan satu sesi kuis untuk memantau persentase jawaban benar
          dan riwayat skor Anda.
        </p>
      )}
    </div>
  );

  if (stage === 'setup') {
    return (
      <section aria-label="Pengaturan Kuis ABC" className="max-w-3xl space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0" aria-hidden="true" />
              <span>
                {datasetMode === 'irodori'
                  ? `Kuis Kotoba & Kanji ${irodoriBook.label}`
                  : 'Kuis ABC Multi-Model'}
              </span>
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Setiap {datasetMode === 'irodori' ? 'kosakata' : 'kanji'} memiliki hingga 5 variasi
              soal otomatis. Untuk soal melengkapi kalimat, pilihan jawaban sudah disesuaikan dengan{' '}
              <strong>konjugasi</strong> dan kelas kata dalam pilihan yang aktif.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" id="quizTypeGrid">
            {QUIZ_TYPE_OPTIONS.map(opt => {
              const active = quizTypeChoice === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setQuizTypeChoice(opt.key)}
                  className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left text-sm font-semibold inline-flex items-center gap-2.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                    opt.fullWidth ? 'sm:col-span-2' : ''
                  } ${
                    active
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-jp text-xs font-bold text-indigo-700 shrink-0">
                    {opt.short}
                  </span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <p className="text-sm text-slate-600">
            Bank soal aktif:{' '}
            <strong className="text-slate-900 font-mono-num">
              {activeScopeLabel} ({kanjiCount} {datasetMode === 'irodori' ? 'kosakata' : 'kanji'} ×{' '}
              {modelCount} model = {totalBank.toLocaleString('id-ID')} soal unik)
            </strong>
            .
          </p>

          <div>
            <div className="text-sm font-bold text-slate-900 mb-2.5">Pilih jumlah soal:</div>
            <div className="grid grid-cols-3 gap-2.5">
              {PRESET_COUNTS.map(cnt => (
                <button
                  key={cnt}
                  type="button"
                  disabled={cnt > totalBank}
                  onClick={() => startQuiz(cnt)}
                  className="min-h-[46px] px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold font-mono-num transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
                >
                  {cnt} soal
                </button>
              ))}
              <button
                type="button"
                id="btnQuizAllBank"
                disabled={totalBank === 0}
                onClick={() => startQuiz('all')}
                className="min-h-[46px] px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold font-mono-num transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                Semua ({totalBank})
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                ref={customInputRef}
                type="number"
                id="quizCustomCount"
                min={1}
                max={totalBank}
                value={customCount}
                onChange={e => setCustomCount(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const parsed = parseInt(customCount, 10);
                    if (parsed >= 1) startQuiz(parsed);
                  }
                }}
                placeholder={`Atau ketik jumlah soal (1–${totalBank})…`}
                aria-label="Jumlah soal kuis kustom"
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                id="btnStartCustomQuiz"
                onClick={() => {
                  const parsed = parseInt(customCount, 10);
                  if (!parsed || parsed < 1) {
                    customInputRef.current?.focus();
                    return;
                  }
                  startQuiz(parsed);
                }}
                className="min-h-[44px] px-5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 text-sm font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                Mulai
              </button>
            </div>

            {disabledPresets.length > 0 ? (
              <p className="mt-2.5 text-xs font-medium text-amber-800">
                Total bank soal pada filter ini adalah {totalBank} soal, sehingga opsi{' '}
                {disabledPresets.join(', ')} dinonaktifkan.
              </p>
            ) : null}
          </div>
        </div>

        {performancePanel}
      </section>
    );
  }

  if (stage === 'run') {
    const q = questions[pos];
    if (!q) return null;
    const qInfo = QTYPES[q.type];
    const progressPct = (pos / questions.length) * 100;
    const isMeaningList = q.type === 'k2m';

    return (
      <section aria-label="Sesi Kuis Berlangsung" className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-600 font-mono-num" id="quizCounter">
            Soal {pos + 1} dari {questions.length}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-indigo-700" id="quizModeBadge">
              {qInfo.short} · {qInfo.label}
            </span>
            <button
              type="button"
              id="btnQuizFinishEarly"
              onClick={() => {
                if (timerRef.current) clearTimeout(timerRef.current);
                if (rightList.length + wrongList.length === 0) {
                  setStage('setup');
                } else {
                  setStage('result');
                }
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              Selesai
            </button>
          </div>
        </div>

        <div className="h-2 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 text-center">
          <p className="text-xs font-semibold text-slate-500 tracking-wide">{qInfo.prompt}</p>

          <div
            id="quizMain"
            className={`mt-3 font-jp font-extrabold text-slate-900 break-words ${
              q.type === 'r2k'
                ? 'text-3xl sm:text-5xl text-indigo-700'
                : q.type === 'm2k'
                  ? 'text-2xl sm:text-3xl font-sans'
                  : q.type === 'ex2k'
                    ? 'text-xl sm:text-2xl font-bold leading-relaxed'
                    : q.item.k.length >= 6
                      ? 'text-3xl sm:text-5xl'
                      : q.item.k.length >= 4
                        ? 'text-4xl sm:text-6xl'
                        : 'text-5xl sm:text-7xl'
            }`}
          >
            {q.type === 'k2r' || q.type === 'k2m'
              ? q.item.k
              : q.type === 'm2k'
                ? q.item.m
                : q.type === 'r2k'
                  ? q.item.r
                  : q.exMeta?.maskedEx}
          </div>

          {q.type === 'ex2k' ? (
            <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium">{q.item.exi}</p>
          ) : null}
        </div>

        <div
          id="quizOptions"
          className={`grid gap-3 ${isMeaningList ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2'}`}
        >
          {q.options.map((optObj, idx) => {
            const isCorrectOpt = optObj.item.id === q.item.id;
            const isChosen = selectedIdx === idx;
            let optClass =
              'bg-white border-slate-200 text-slate-900 hover:border-indigo-300 hover:bg-indigo-50/40';
            if (locked) {
              if (isCorrectOpt) {
                optClass = 'bg-emerald-50 border-emerald-500 text-emerald-900';
              } else if (isChosen) {
                optClass = 'bg-rose-50 border-rose-500 text-rose-900';
              } else {
                optClass = 'bg-white border-slate-200 text-slate-400 opacity-60';
              }
            }

            return (
              <button
                key={`${optObj.item.id}-${idx}`}
                type="button"
                disabled={locked}
                onClick={() => handleAnswer(optObj, idx)}
                className={`min-h-[56px] p-4 rounded-xl border-2 text-left transition-colors flex items-center gap-3 cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-indigo-600 ${optClass}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold shrink-0 font-mono-num ${
                    locked && isCorrectOpt
                      ? 'bg-emerald-600 text-white'
                      : locked && isChosen && !isCorrectOpt
                        ? 'bg-rose-600 text-white'
                        : 'bg-indigo-50 text-indigo-700'
                  }`}
                >
                  {ABC_LABELS[idx]}
                </span>
                <span className="font-jp text-base sm:text-lg font-bold break-words">
                  {optObj.label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="hidden md:block text-center text-xs text-slate-500">
          Tekan tombol A–D atau 1–4 pada keyboard untuk memilih jawaban.
        </p>
      </section>
    );
  }

  // Result view
  const answered = rightList.length + wrongList.length;
  const score = calculateQuizScore(rightList.length, answered);
  const modeSummary =
    quizTypeChoice === 'random'
      ? 'Acak 4 Model Utama'
      : quizTypeChoice === 'random5'
        ? 'Acak 5 Model (+Kalimat)'
        : QTYPES[quizTypeChoice].label;

  let msg = 'Jangan menyerah — ulangi kartunya lalu coba lagi!';
  if (score === 100) msg = 'Sempurna! Semua benar.';
  else if (score >= 80) msg = 'Hebat! Sedikit lagi sempurna.';
  else if (score >= 60) msg = 'Lumayan! Terus latihan ya.';
  else if (score >= 40) msg = 'Masih perlu dipelajari lagi, semangat!';

  return (
    <section aria-label="Hasil Kuis" className="max-w-4xl space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-sm font-semibold text-slate-500">Skor Akhir</p>
        <div className="mt-2 text-5xl font-extrabold text-indigo-700 font-mono-num" id="quizScore">
          {score}
        </div>
        <p className="mt-2 text-base font-bold text-slate-900">{msg}</p>
        <p className="mt-1 text-sm text-slate-600 font-mono-num">
          {rightList.length} benar · {wrongList.length} salah (dari {answered} soal) · {modeSummary}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {wrongList.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-base font-bold text-rose-700 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Perlu Diperbaiki ({wrongList.length})</span>
            </h3>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {wrongList.map(rec => (
                <div
                  key={`w-${rec.no}`}
                  className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 text-sm leading-relaxed"
                >
                  <div className="text-xs font-semibold text-slate-500">
                    No. {rec.no} · {QTYPES[rec.type].label}
                  </div>
                  {rec.type === 'ex2k' ? (
                    <div className="mt-1 space-y-1">
                      <p className="font-jp font-semibold text-slate-900">{rec.item.ex}</p>
                      <p className="text-xs sm:text-sm text-slate-700">
                        Benar:{' '}
                        <strong className="text-emerald-700 font-jp">
                          {rec.exMeta?.targetSurface ?? rec.item.k}
                        </strong>{' '}
                        ({rec.item.r}, {rec.item.m}) · Jawabanmu:{' '}
                        <strong className="text-rose-700 font-jp">{rec.chosenLabel}</strong> (
                        {rec.chosen.m})
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-800">
                      <strong className="font-jp text-base">{rec.item.k}</strong> ({rec.item.r}) —{' '}
                      <span className="text-emerald-700 font-semibold">{rec.item.m}</span> ·
                      Jawabanmu:{' '}
                      <span className="text-rose-700 font-semibold">
                        {rec.type === 'k2r'
                          ? rec.chosen.r
                          : rec.type === 'k2m'
                            ? rec.chosen.m
                            : rec.chosen.k}
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {rightList.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-base font-bold text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Jawaban Benar ({rightList.length})</span>
            </h3>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {rightList.map(rec => {
                const ansShow =
                  rec.type === 'ex2k' &&
                  rec.exMeta &&
                  rec.exMeta.targetSurface !== rec.item.k
                    ? `${rec.exMeta.targetSurface} (${rec.item.k})`
                    : rec.item.k;
                return (
                  <div
                    key={`r-${rec.no}`}
                    className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 text-sm"
                  >
                    <span className="text-xs font-semibold text-slate-500">
                      No. {rec.no} · {QTYPES[rec.type].short}
                    </span>
                    <div className="mt-0.5 text-slate-900">
                      <strong className="font-jp text-base">{ansShow}</strong> · {rec.item.r} —{' '}
                      {rec.item.m}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        id="btnQuizAgain"
        onClick={() => setStage('setup')}
        className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        <span>Kuis Baru (Acak Ulang)</span>
      </button>

      {performancePanel}
    </section>
  );
}
