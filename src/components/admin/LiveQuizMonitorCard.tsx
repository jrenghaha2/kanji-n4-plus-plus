import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Radio,
  XCircle,
} from 'lucide-react';
import type { DecodedLiveQuizQuestion, MonitoredUserRow } from '../../types/admin';
import { QTYPES } from '../../utils/quizEngine';
import { getQuizModelLabel } from '../quiz/quizHelpers';

interface LiveQuizMonitorCardProps {
  row: MonitoredUserRow;
}

function QuestionChoicesGrid({
  q,
  compact = false,
}: {
  q: DecodedLiveQuizQuestion;
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {q.options.map(opt => {
        let cardClass =
          'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900/90 text-slate-800 dark:text-slate-100';
        let letterClass =
          'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
        let statusTag: string | null = null;
        let statusClass = '';

        if (q.answered) {
          if (opt.isChosen && opt.isCorrectOption) {
            cardClass =
              'border-emerald-500 dark:border-emerald-500/80 bg-emerald-50/85 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100';
            letterClass = 'bg-emerald-600 text-white';
            statusTag = 'Dipilih · Benar';
            statusClass = 'text-emerald-700 dark:text-emerald-300';
          } else if (opt.isChosen && !opt.isCorrectOption) {
            cardClass =
              'border-rose-500 dark:border-rose-500/80 bg-rose-50/85 dark:bg-rose-950/50 text-rose-950 dark:text-rose-100';
            letterClass = 'bg-rose-600 text-white';
            statusTag = 'Dipilih · Salah';
            statusClass = 'text-rose-700 dark:text-rose-300';
          } else if (opt.isCorrectOption) {
            cardClass =
              'border-emerald-400/90 dark:border-emerald-600/80 bg-emerald-50/45 dark:bg-emerald-950/25 text-emerald-950 dark:text-emerald-100';
            letterClass = 'bg-emerald-600/90 text-white';
            statusTag = 'Kunci Jawaban';
            statusClass = 'text-emerald-700 dark:text-emerald-300';
          } else {
            cardClass =
              'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400';
          }
        } else if (opt.isCorrectOption) {
          cardClass =
            'border-emerald-300/90 dark:border-emerald-700/70 bg-emerald-50/35 dark:bg-emerald-950/20 text-slate-900 dark:text-slate-50';
          letterClass =
            'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200';
          statusTag = 'Kunci';
          statusClass = 'text-emerald-700 dark:text-emerald-400';
        }

        return (
          <div
            key={`${q.no}-${opt.index}-${opt.itemId}`}
            className={`rounded-lg border ${
              compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
            } flex items-start gap-2.5 transition-colors ${cardClass}`}
          >
            <span
              className={`inline-flex items-center justify-center rounded-md font-mono-num font-bold shrink-0 ${
                compact ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-xs'
              } ${letterClass}`}
            >
              {opt.letter}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span
                  className={`font-jp font-semibold break-words leading-snug ${
                    compact ? 'text-xs sm:text-sm' : 'text-sm'
                  }`}
                >
                  {opt.label}
                </span>
                {statusTag ? (
                  <span
                    className={`text-[11px] font-bold whitespace-nowrap shrink-0 ${statusClass}`}
                  >
                    {statusTag}
                  </span>
                ) : null}
              </div>
              {opt.isChosen && !opt.isCorrectOption ? (
                <div className="mt-0.5 text-[11px] text-rose-700/90 dark:text-rose-300/90 truncate">
                  {q.type === 'k2m'
                    ? `${opt.itemK}${opt.itemR && opt.itemR !== opt.itemK ? ` (${opt.itemR})` : ''}`
                    : opt.itemM}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LiveQuizMonitorCard({ row }: LiveQuizMonitorCardProps) {
  const [logFilter, setLogFilter] = useState<'all' | 'wrong' | 'right'>('all');
  const [showAnsweredHistory, setShowAnsweredHistory] = useState(true);

  const currentQ = row.liveQuizCurrent;
  const datasetMode = row.datasetId === 'n4' ? 'n4' : 'irodori';

  // Answered log newest-first; hide duplicate of currentQ while currentQ itself is showing its answered state
  const answeredHistory = useMemo(() => {
    const items = row.liveQuizLog.filter(
      item => !(currentQ && currentQ.answered && item.no === currentQ.no)
    );
    return items.reverse();
  }, [row.liveQuizLog, currentQ]);

  const totalAnswered = row.liveQuizLog.length;
  const correctTotal = useMemo(
    () => row.liveQuizLog.filter(item => item.isCorrect === true).length,
    [row.liveQuizLog]
  );
  const wrongTotal = Math.max(0, totalAnswered - correctTotal);

  const filteredHistory = useMemo(() => {
    if (logFilter === 'wrong') return answeredHistory.filter(i => i.isCorrect === false);
    if (logFilter === 'right') return answeredHistory.filter(i => i.isCorrect === true);
    return answeredHistory;
  }, [answeredHistory, logFilter]);

  if (!currentQ && row.liveQuizLog.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200/90 dark:border-amber-800/60 bg-amber-50/35 dark:bg-slate-950/60 p-3.5 sm:p-4 space-y-3.5">
      {/* Live Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {row.quizInProgress ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
          ) : (
            <CheckCircle2
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
              aria-hidden="true"
            />
          )}
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
            {row.quizInProgress
              ? 'Pantauan Soal Kuis Real-Time'
              : 'Sesi Kuis Baru Selesai'}
          </span>
          {row.scopeLabel ? (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
              · {row.scopeLabel}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num">
          {row.quizInProgress && row.quizTotalQuestions > 0 ? (
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Soal {row.quizCurrentQuestion}/{row.quizTotalQuestions}
            </span>
          ) : (
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {totalAnswered} soal dijawab
            </span>
          )}
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            {Math.max(row.quizCorrectCount, correctTotal)} benar
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="font-semibold text-rose-700 dark:text-rose-400">
            {wrongTotal} salah
          </span>
        </div>
      </div>

      {/* Active Question Stage */}
      {currentQ ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-300">
              <Radio className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="font-mono-num">Soal #{currentQ.no}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span>
                {QTYPES[currentQ.type].short} · {getQuizModelLabel(currentQ.type, datasetMode)}
              </span>
            </div>

            {!currentQ.answered ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Menunggu pilihan jawaban...</span>
              </span>
            ) : currentQ.isCorrect ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Benar — memilih {currentQ.chosenOption?.letter}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-rose-700 dark:text-rose-400">
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Salah — memilih {currentQ.chosenOption?.letter} (Kunci:{' '}
                  {currentQ.correctOption?.letter})
                </span>
              </span>
            )}
          </div>

          {/* Prompt */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 px-3.5 py-3 space-y-1">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {currentQ.promptTitle}
            </p>
            <div className="flex flex-wrap items-baseline gap-2">
              <p
                className={`font-jp font-extrabold text-slate-900 dark:text-slate-50 break-words leading-snug ${
                  currentQ.type === 'ex2k'
                    ? 'text-base sm:text-lg'
                    : currentQ.type === 'm2k'
                      ? 'text-base sm:text-xl font-sans'
                      : 'text-2xl sm:text-3xl'
                }`}
              >
                {currentQ.promptMain}
              </p>
              {currentQ.promptHint ? (
                <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200/70 dark:border-indigo-800/70 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                  {currentQ.promptHint}
                </span>
              ) : null}
            </div>
            {currentQ.promptSub ? (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {currentQ.promptSub}
              </p>
            ) : null}
          </div>

          {/* Options A-D */}
          <QuestionChoicesGrid q={currentQ} />
        </div>
      ) : null}

      {/* Answered Questions Timeline in Ongoing/Just-Finished Session */}
      {answeredHistory.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowAnsweredHistory(prev => !prev)}
              className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {showAnsweredHistory ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>
                Riwayat Jawaban Sesi Ini ({answeredHistory.length} soal)
              </span>
            </button>

            {showAnsweredHistory ? (
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label="Filter riwayat jawaban sesi berjalan"
              >
                {(
                  [
                    { key: 'all', label: `Semua (${answeredHistory.length})` },
                    {
                      key: 'wrong',
                      label: `Salah (${answeredHistory.filter(i => i.isCorrect === false).length})`,
                    },
                    {
                      key: 'right',
                      label: `Benar (${answeredHistory.filter(i => i.isCorrect === true).length})`,
                    },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setLogFilter(tab.key)}
                    aria-pressed={logFilter === tab.key}
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer ${
                      logFilter === tab.key
                        ? tab.key === 'wrong'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : tab.key === 'right'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-slate-900 dark:bg-indigo-600 border-slate-900 dark:border-indigo-500 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {showAnsweredHistory ? (
            filteredHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                Tidak ada soal pada filter ini.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                {filteredHistory.map(item => (
                  <div
                    key={`live-ans-${item.no}`}
                    className={`rounded-lg border p-3 space-y-2 ${
                      item.isCorrect
                        ? 'border-emerald-200/90 dark:border-emerald-800/60 bg-white dark:bg-slate-900/90'
                        : 'border-rose-200/90 dark:border-rose-800/60 bg-white dark:bg-slate-900/90'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-300 font-mono-num">
                        Soal #{item.no} · {getQuizModelLabel(item.type, datasetMode)}
                      </span>
                      {item.isCorrect ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Benar · Pilih {item.chosenOption?.letter}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            Salah · Pilih {item.chosenOption?.letter} (Kunci:{' '}
                            {item.correctOption?.letter})
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-jp font-bold text-slate-900 dark:text-slate-50 break-words">
                      {item.promptMain}
                      {item.promptHint ? (
                        <span className="ml-2 text-xs font-sans font-medium text-indigo-700 dark:text-indigo-300">
                          ({item.promptHint})
                        </span>
                      ) : null}
                    </div>
                    {item.promptSub ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                        {item.promptSub}
                      </div>
                    ) : null}

                    <QuestionChoicesGrid q={item} compact />
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
