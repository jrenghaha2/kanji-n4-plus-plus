import type { ReactNode } from 'react';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import type { AppDatasetMode, QuizRecord, QuizTypeChoice } from '../../types/kanji';
import { QTYPES, calculateQuizScore } from '../../utils/quizEngine';
import { getQuizModelLabel } from './quizHelpers';

interface QuizResultViewProps {
  datasetMode: AppDatasetMode;
  quizTypeChoice: QuizTypeChoice;
  rightList: QuizRecord[];
  wrongList: QuizRecord[];
  onPlayAgain: () => void;
  performancePanel: ReactNode;
}

export function QuizResultView({
  datasetMode,
  quizTypeChoice,
  rightList,
  wrongList,
  onPlayAgain,
  performancePanel,
}: QuizResultViewProps) {
  const answered = rightList.length + wrongList.length;
  const score = calculateQuizScore(rightList.length, answered);
  const modeSummary =
    quizTypeChoice === 'random'
      ? 'Acak 4 Model Utama'
      : quizTypeChoice === 'random5'
        ? 'Acak 5 Model (+Kalimat)'
        : getQuizModelLabel(quizTypeChoice, datasetMode);

  let msg = 'Jangan menyerah — ulangi kartunya lalu coba lagi!';
  if (score === 100) msg = 'Sempurna! Semua benar.';
  else if (score >= 80) msg = 'Hebat! Sedikit lagi sempurna.';
  else if (score >= 60) msg = 'Lumayan! Terus latihan ya.';
  else if (score >= 40) msg = 'Masih perlu dipelajari lagi, semangat!';

  return (
    <section aria-label="Hasil Kuis" className="max-w-4xl space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Skor Akhir</p>
        <div className="mt-2 text-5xl font-extrabold text-indigo-700 dark:text-indigo-400 font-mono-num" id="quizScore">
          {score}
        </div>
        <p className="mt-2 text-base font-bold text-slate-900 dark:text-slate-50">{msg}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-mono-num">
          {rightList.length} benar · {wrongList.length} salah (dari {answered} soal) · {modeSummary}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {wrongList.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-base font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Perlu Diperbaiki ({wrongList.length})</span>
            </h3>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {wrongList.map(rec => (
                <div
                  key={`w-${rec.no}`}
                  className="rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/35 p-3.5 text-sm leading-relaxed"
                >
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    No. {rec.no} · {getQuizModelLabel(rec.type, datasetMode)}
                  </div>
                  {rec.type === 'ex2k' ? (
                    <div className="mt-1 space-y-1">
                      <p className="font-jp font-semibold text-slate-900 dark:text-slate-50">{rec.item.ex}</p>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                        Benar:{' '}
                        <strong className="text-emerald-700 dark:text-emerald-400 font-jp">
                          {rec.exMeta?.targetSurface ?? rec.item.k}
                        </strong>{' '}
                        ({rec.item.r}, {rec.item.m}) · Jawabanmu:{' '}
                        <strong className="text-rose-700 dark:text-rose-400 font-jp">{rec.chosenLabel}</strong> (
                        {rec.chosen.m})
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-800 dark:text-slate-200">
                      <strong className="font-jp text-base text-slate-900 dark:text-slate-50">{rec.item.k}</strong>
                      {rec.item.r && rec.item.r !== rec.item.k ? ` (${rec.item.r})` : ''} —{' '}
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{rec.item.m}</span> ·
                      Jawabanmu:{' '}
                      <span className="text-rose-700 dark:text-rose-400 font-semibold">
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
            <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
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
                const showReading = rec.item.r && rec.item.r !== ansShow;
                return (
                  <div
                    key={`r-${rec.no}`}
                    className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/35 p-3.5 text-sm"
                  >
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      No. {rec.no} · {QTYPES[rec.type].short}
                    </span>
                    <div className="mt-0.5 text-slate-900 dark:text-slate-100">
                      <strong className="font-jp text-base text-slate-900 dark:text-slate-50">{ansShow}</strong>
                      {showReading ? ` · ${rec.item.r}` : ''} — {rec.item.m}
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
        onClick={onPlayAgain}
        className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        <span>Kuis Baru (Acak Ulang)</span>
      </button>

      {performancePanel}
    </section>
  );
}
