import { useEffect, useMemo } from 'react';
import { CheckCircle2, History, X, XCircle } from 'lucide-react';
import { LEVELS } from '../../data/kanjiData';
import type {
  AppDatasetMode,
  IrodoriBookConfig,
  QuizSessionHistoryEntry,
} from '../../types/kanji';
import {
  MODE_SHORT_LABEL,
  formatQuizTimestamp,
  getQuizModelLabel,
} from './quizHelpers';

interface QuizAnswerHistoryModalProps {
  datasetMode: AppDatasetMode;
  irodoriBook: IrodoriBookConfig;
  quizHistory: QuizSessionHistoryEntry[];
  activeSession: QuizSessionHistoryEntry;
  answerFilter: 'all' | 'wrong' | 'right';
  cloudSyncEnabled: boolean;
  quizHistorySyncing: boolean;
  onSelectSession: (sessionId: string) => void;
  onSelectFilter: (filter: 'all' | 'wrong' | 'right') => void;
  onClose: () => void;
}

export function QuizAnswerHistoryModal({
  datasetMode,
  irodoriBook,
  quizHistory,
  activeSession,
  answerFilter,
  cloudSyncEnabled,
  quizHistorySyncing,
  onSelectSession,
  onSelectFilter,
  onClose,
}: QuizAnswerHistoryModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const activeSessionAnswers = activeSession.answers ?? [];

  const filteredHistoryAnswers = useMemo(() => {
    if (answerFilter === 'wrong') return activeSessionAnswers.filter(a => !a.correct);
    if (answerFilter === 'right') return activeSessionAnswers.filter(a => a.correct);
    return activeSessionAnswers;
  }, [activeSessionAnswers, answerFilter]);

  const wrongCount = useMemo(
    () => activeSessionAnswers.filter(a => !a.correct).length,
    [activeSessionAnswers]
  );
  const rightCount = useMemo(
    () => activeSessionAnswers.filter(a => a.correct).length,
    [activeSessionAnswers]
  );

  return (
    <div
      id="quizAnswerHistoryModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quizAnswerHistoryTitle"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-slate-950/75 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h4
              id="quizAnswerHistoryTitle"
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2"
            >
              <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
              <span>Riwayat Jawaban Kuis</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {datasetMode === 'irodori' ? irodoriBook.label : 'JLPT N4 Kanji'} ·{' '}
              {quizHistory.length} sesi tersimpan
              {cloudSyncEnabled
                ? quizHistorySyncing
                  ? ' · menyinkronkan...'
                  : ' · sinkron cloud aktif'
                : ''}
            </p>
          </div>
          <button
            type="button"
            id="btnCloseQuizAnswerHistory"
            onClick={onClose}
            aria-label="Tutup riwayat jawaban"
            className="min-h-[36px] min-w-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {quizHistory.length > 1 ? (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60">
            <label
              htmlFor="quizHistorySessionSelect"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
            >
              Pilih Sesi Kuis
            </label>
            <select
              id="quizHistorySessionSelect"
              value={activeSession.id}
              onChange={e => onSelectSession(e.target.value)}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {quizHistory.map((entry, idx) => (
                <option key={entry.id} value={entry.id}>
                  Sesi #{quizHistory.length - idx} · {MODE_SHORT_LABEL[entry.mode]} ·{' '}
                  {entry.scopeLabel ?? `Level ${LEVELS[entry.level].label}`} · {entry.correct}/
                  {entry.total} ({entry.score}%) · {formatQuizTimestamp(entry.completedAt)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <strong className="font-jp text-slate-900 dark:text-slate-50">
              {MODE_SHORT_LABEL[activeSession.mode]}
            </strong>{' '}
            · {activeSession.scopeLabel ?? `Level ${LEVELS[activeSession.level].label}`} ·{' '}
            <strong className="font-mono-num text-indigo-700 dark:text-indigo-400">{activeSession.score}%</strong>{' '}
            <span className="text-slate-500 dark:text-slate-400 font-mono-num">
              ({activeSession.correct}/{activeSession.total} benar)
            </span>
          </div>

          {activeSessionAnswers.length > 0 ? (
            <div className="flex items-center gap-1.5" role="group" aria-label="Filter jawaban">
              <button
                type="button"
                onClick={() => onSelectFilter('all')}
                aria-pressed={answerFilter === 'all'}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                  answerFilter === 'all'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                Semua ({activeSessionAnswers.length})
              </button>
              <button
                type="button"
                onClick={() => onSelectFilter('wrong')}
                aria-pressed={answerFilter === 'wrong'}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                  answerFilter === 'wrong'
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300'
                }`}
              >
                Salah ({wrongCount})
              </button>
              <button
                type="button"
                onClick={() => onSelectFilter('right')}
                aria-pressed={answerFilter === 'right'}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                  answerFilter === 'right'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-700 dark:hover:text-emerald-300'
                }`}
              >
                Benar ({rightCount})
              </button>
            </div>
          ) : null}
        </div>

        <div className="p-5 overflow-y-auto space-y-2.5 flex-1" id="quizAnswerHistoryList">
          {activeSessionAnswers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed text-center py-8">
              Detail jawaban per soal belum tersimpan untuk sesi lama ini. Selesaikan sesi kuis
              baru untuk melihat riwayat jawaban lengkap.
            </p>
          ) : filteredHistoryAnswers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed text-center py-8">
              {answerFilter === 'wrong'
                ? 'Tidak ada jawaban salah pada sesi ini. Sempurna!'
                : 'Tidak ada jawaban benar pada filter ini.'}
            </p>
          ) : (
            filteredHistoryAnswers.map(ans => {
              const showReading = ans.itemR && ans.itemR !== ans.itemK;
              return (
                <div
                  key={`${activeSession.id}-${ans.no}`}
                  className={`rounded-xl border p-3.5 text-sm leading-relaxed ${
                    ans.correct
                      ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/35'
                      : 'border-rose-200 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/35'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <span className="text-slate-500 dark:text-slate-400">
                      No. {ans.no} · {getQuizModelLabel(ans.type, datasetMode)}
                    </span>
                    <span
                      className={
                        ans.correct
                          ? 'text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1'
                          : 'text-rose-700 dark:text-rose-400 inline-flex items-center gap-1'
                      }
                    >
                      {ans.correct ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Benar</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Salah</span>
                        </>
                      )}
                    </span>
                  </div>

                  {ans.type === 'ex2k' && ans.ex ? (
                    <div className="mt-1 space-y-1">
                      <p className="font-jp font-semibold text-slate-900 dark:text-slate-50">{ans.ex}</p>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                        Benar:{' '}
                        <strong className="text-emerald-700 dark:text-emerald-400 font-jp">{ans.expectedLabel}</strong> (
                        {ans.itemR}, {ans.itemM})
                        {!ans.correct ? (
                          <>
                            {' '}
                            · Jawabanmu:{' '}
                            <strong className="text-rose-700 dark:text-rose-400 font-jp">{ans.chosenLabel}</strong>
                            {ans.chosenM ? ` (${ans.chosenM})` : ''}
                          </>
                        ) : null}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-800 dark:text-slate-200">
                      <strong className="font-jp text-base text-slate-900 dark:text-slate-50">{ans.itemK}</strong>
                      {showReading ? ` (${ans.itemR})` : ''} —{' '}
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{ans.itemM}</span>
                      {!ans.correct ? (
                        <>
                          {' '}
                          · Jawabanmu:{' '}
                          <span className="text-rose-700 dark:text-rose-400 font-semibold">{ans.chosenLabel}</span>
                          {ans.type !== 'k2m' && ans.chosenM ? ` (${ans.chosenM})` : ''}
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
