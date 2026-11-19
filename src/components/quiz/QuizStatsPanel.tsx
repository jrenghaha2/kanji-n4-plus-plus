import { useMemo } from 'react';
import { BarChart3, History, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { LEVELS } from '../../data/kanjiData';
import type {
  AppDatasetMode,
  IrodoriBookConfig,
  QuizSessionHistoryEntry,
} from '../../types/kanji';
import type { QuizPerformanceStats } from '../../utils/quizStats';
import { QuizAnswerHistoryModal } from './QuizAnswerHistoryModal';
import { MODE_SHORT_LABEL, formatQuizTimestamp } from './quizHelpers';

interface QuizStatsPanelProps {
  datasetMode: AppDatasetMode;
  irodoriBook: IrodoriBookConfig;
  quizHistory: QuizSessionHistoryEntry[];
  performanceStats: QuizPerformanceStats;
  cloudSyncEnabled: boolean;
  quizHistorySyncing: boolean;
  confirmClearHistory: boolean;
  historyModalSessionId: string | null;
  historyAnswerFilter: 'all' | 'wrong' | 'right';
  onRequestClearHistory: (confirm: boolean) => void;
  onConfirmClearHistory: () => void;
  onOpenAnswerHistory: (sessionId?: string) => void;
  onSelectHistorySession: (sessionId: string) => void;
  onSelectHistoryFilter: (filter: 'all' | 'wrong' | 'right') => void;
  onCloseAnswerHistory: () => void;
}

export function QuizStatsPanel({
  datasetMode,
  irodoriBook,
  quizHistory,
  performanceStats,
  cloudSyncEnabled,
  quizHistorySyncing,
  confirmClearHistory,
  historyModalSessionId,
  historyAnswerFilter,
  onRequestClearHistory,
  onConfirmClearHistory,
  onOpenAnswerHistory,
  onSelectHistorySession,
  onSelectHistoryFilter,
  onCloseAnswerHistory,
}: QuizStatsPanelProps) {
  const recentScores = quizHistory.slice(0, 6);

  const activeHistorySession = useMemo(
    () =>
      historyModalSessionId
        ? (quizHistory.find(entry => entry.id === historyModalSessionId) ?? quizHistory[0] ?? null)
        : null,
    [historyModalSessionId, quizHistory]
  );

  return (
    <div
      id="quizStatsPanel"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
          <span>Statistik Performa Kuis</span>
        </h3>

        {quizHistory.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btnOpenQuizAnswerHistory"
              onClick={() => onOpenAnswerHistory()}
              className="min-h-[32px] px-3 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Riwayat Jawaban</span>
            </button>

            {confirmClearHistory ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btnConfirmClearQuizStats"
                  onClick={onConfirmClearHistory}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Ya, Hapus
                </button>
                <button
                  type="button"
                  onClick={() => onRequestClearHistory(false)}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                id="btnClearQuizStats"
                onClick={() => onRequestClearHistory(true)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 text-slate-500 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Hapus Riwayat</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-2">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Persentase Jawaban Benar</div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              id="quizStatAccuracy"
              className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono-num"
            >
              {performanceStats.overallAccuracyPct}%
            </span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 font-mono-num">
              {performanceStats.totalCorrect}/{performanceStats.totalAnswered} benar
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" aria-hidden="true">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${performanceStats.overallAccuracyPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Skor Terakhir</div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              id="quizStatLatest"
              className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400 font-mono-num"
            >
              {performanceStats.latestScore !== null ? `${performanceStats.latestScore}%` : '—'}
            </span>
            {performanceStats.trendDelta !== null ? (
              <span
                className={`text-xs font-bold font-mono-num inline-flex items-center gap-0.5 ${
                  performanceStats.trendDelta > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : performanceStats.trendDelta < 0
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
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
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {performanceStats.totalSessions === 1 ? 'Sesi pertama' : 'Belum ada sesi'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {performanceStats.trendDelta !== null
              ? 'Dibanding skor kuis sebelumnya'
              : 'Selesaikan kuis untuk melihat tren'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Skor Terbaik</div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              id="quizStatBest"
              className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 font-mono-num"
            >
              {performanceStats.totalSessions > 0 ? `${performanceStats.bestScore}%` : '—'}
            </span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 font-mono-num">
              {performanceStats.totalSessions} sesi
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Rekor akurasi tertinggi yang tersimpan</p>
        </div>
      </div>

      {recentScores.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Riwayat Skor Terakhir
          </div>
          <ul
            id="quizRecentHistory"
            className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
          >
            {recentScores.map(entry => {
              const barColor =
                entry.score >= 80
                  ? 'bg-emerald-600 dark:bg-emerald-500'
                  : entry.score >= 60
                    ? 'bg-indigo-600 dark:bg-indigo-500'
                    : 'bg-amber-500';
              const textColor =
                entry.score >= 80
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : entry.score >= 60
                    ? 'text-indigo-700 dark:text-indigo-400'
                    : 'text-amber-700 dark:text-amber-400';

              return (
                <li
                  key={entry.id}
                  className="px-3.5 py-2.5 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-jp font-bold text-slate-900 dark:text-slate-50 shrink-0">
                      {MODE_SHORT_LABEL[entry.mode]}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                      {entry.scopeLabel ?? `Level ${LEVELS[entry.level].label}`}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600 hidden sm:inline" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                      {formatQuizTimestamp(entry.completedAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 ml-auto shrink-0">
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-mono-num">
                      {entry.correct}/{entry.total}
                    </span>
                    <div
                      className="w-16 sm:w-20 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
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
                    <button
                      type="button"
                      onClick={() => onOpenAnswerHistory(entry.id)}
                      aria-label={`Lihat detail jawaban sesi ${entry.scopeLabel ?? LEVELS[entry.level].label} (${entry.score}%)`}
                      className="min-h-[28px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/70 hover:border-indigo-200 dark:hover:border-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-200 text-slate-600 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Detail
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Belum ada riwayat skor. Selesaikan satu sesi kuis untuk memantau persentase jawaban benar
          dan riwayat skor Anda.
        </p>
      )}

      {activeHistorySession ? (
        <QuizAnswerHistoryModal
          datasetMode={datasetMode}
          irodoriBook={irodoriBook}
          quizHistory={quizHistory}
          activeSession={activeHistorySession}
          answerFilter={historyAnswerFilter}
          cloudSyncEnabled={cloudSyncEnabled}
          quizHistorySyncing={quizHistorySyncing}
          onSelectSession={onSelectHistorySession}
          onSelectFilter={onSelectHistoryFilter}
          onClose={onCloseAnswerHistory}
        />
      ) : null}
    </div>
  );
}
