import { ArrowRight, XCircle } from 'lucide-react';
import type {
  AppDatasetMode,
  QuizOption,
  QuizQuestion,
  QuizRecord,
} from '../../types/kanji';
import { ABC_LABELS, QTYPES } from '../../utils/quizEngine';
import { getQuizModelLabel, renderRubyText } from './quizHelpers';

interface QuizRunViewProps {
  datasetMode: AppDatasetMode;
  question: QuizQuestion;
  pos: number;
  totalQuestions: number;
  locked: boolean;
  selectedIdx: number | null;
  wrongFeedback: QuizRecord | null;
  showFurigana: boolean;
  onToggleFurigana: () => void;
  onFinishEarly: () => void;
  onAnswer: (optObj: QuizOption, optIdx: number) => void;
  onAdvanceAfterWrong: () => void;
}

export function QuizRunView({
  datasetMode,
  question: q,
  pos,
  totalQuestions,
  locked,
  selectedIdx,
  wrongFeedback,
  showFurigana,
  onToggleFurigana,
  onFinishEarly,
  onAnswer,
  onAdvanceAfterWrong,
}: QuizRunViewProps) {
  const qInfo = QTYPES[q.type];
  const progressPct = (pos / totalQuestions) * 100;
  const isMeaningList = q.type === 'k2m';
  const supportsFurigana = q.type === 'k2m' || q.type === 'm2k';
  const showPromptFurigana = showFurigana && q.type === 'k2m';
  const showOptionFurigana = showFurigana && q.type === 'm2k';
  const isLastQuestion = pos + 1 >= totalQuestions;

  return (
    <section aria-label="Sesi Kuis Berlangsung" className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 font-mono-num" id="quizCounter">
          Soal {pos + 1} dari {totalQuestions}
        </span>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300" id="quizModeBadge">
            {qInfo.short} · {getQuizModelLabel(q.type, datasetMode)}
          </span>
          {supportsFurigana ? (
            <button
              type="button"
              id="btnQuizRunningFurigana"
              aria-pressed={showFurigana}
              onClick={onToggleFurigana}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                showFurigana
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Furigana: {showFurigana ? 'Aktif' : 'Mati'}
            </button>
          ) : null}
          <button
            type="button"
            id="btnQuizFinishEarly"
            onClick={onFinishEarly}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-10 text-center">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide">
          {datasetMode === 'irodori' && q.type === 'm2k'
            ? 'Pilih kosakata yang artinya:'
            : datasetMode === 'irodori' && q.type === 'ex2k'
              ? 'Kosakata mana yang melengkapi kalimat ini?'
              : qInfo.prompt}
        </p>

        <div
          id="quizMain"
          className={`mt-3 font-jp font-extrabold text-slate-900 dark:text-slate-50 break-words leading-snug ${
            q.type === 'r2k'
              ? 'text-3xl sm:text-5xl text-indigo-700 dark:text-indigo-300'
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
          {q.type === 'k2m' && showPromptFurigana
            ? renderRubyText(
                q.item.k,
                q.item.r,
                'text-xs sm:text-sm font-semibold text-indigo-600 dark:text-indigo-300 select-none'
              )
            : q.type === 'k2r' || q.type === 'k2m'
              ? q.item.k
              : q.type === 'm2k'
                ? q.item.m
                : q.type === 'r2k'
                  ? q.item.r
                  : q.exMeta?.maskedEx}
        </div>

        {q.promptHint ? (
          <p
            id="quizPromptHint"
            className="mt-2.5 inline-block rounded-lg bg-indigo-50 dark:bg-indigo-950/70 px-3 py-1 text-xs sm:text-sm font-semibold text-indigo-700 dark:text-indigo-200"
          >
            {q.promptHint}
          </p>
        ) : null}

        {q.type === 'ex2k' ? (
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium">{q.item.exi}</p>
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
            'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-50 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/40';
          if (locked) {
            if (isCorrectOpt) {
              optClass = 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-100';
            } else if (isChosen) {
              optClass = 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-900 dark:text-rose-100';
            } else {
              optClass = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-60';
            }
          }

          return (
            <button
              key={`${optObj.item.id}-${idx}`}
              type="button"
              disabled={locked}
              onClick={() => onAnswer(optObj, idx)}
              className={`min-h-[56px] p-4 rounded-xl border-2 text-left transition-colors flex items-center gap-3 cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-indigo-500 ${optClass}`}
            >
              <span
                className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold shrink-0 font-mono-num ${
                  locked && isCorrectOpt
                    ? 'bg-emerald-600 text-white'
                    : locked && isChosen && !isCorrectOpt
                      ? 'bg-rose-600 text-white'
                      : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                }`}
              >
                {ABC_LABELS[idx]}
              </span>
              <span className="font-jp text-base sm:text-lg font-bold break-words leading-snug">
                {showOptionFurigana
                  ? renderRubyText(
                      optObj.label,
                      optObj.item.r,
                      'text-[11px] font-medium text-indigo-600 dark:text-indigo-300 select-none'
                    )
                  : optObj.label}
              </span>
            </button>
          );
        })}
      </div>

      {wrongFeedback ? (
        <div
          id="quizWrongFeedback"
          role="status"
          aria-live="polite"
          className="rounded-2xl border-2 border-rose-200 dark:border-rose-800/80 bg-rose-50/80 dark:bg-rose-950/40 p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-rose-800 dark:text-rose-200">
              <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
              <span>Kurang tepat — cek pembahasannya:</span>
            </div>
            <button
              type="button"
              id="btnQuizNextAfterWrong"
              onClick={onAdvanceAfterWrong}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <span>{isLastQuestion ? 'Lihat Hasil Kuis' : 'Soal Berikutnya'}</span>
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-slate-900 p-3 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Jawaban Benar
              </div>
              <div className="text-slate-900 dark:text-slate-50">
                <strong className="font-jp text-base">
                  {wrongFeedback.type === 'ex2k'
                    ? (wrongFeedback.exMeta?.targetSurface ?? wrongFeedback.item.k)
                    : wrongFeedback.item.k}
                </strong>
                {wrongFeedback.item.r && wrongFeedback.item.r !== wrongFeedback.item.k ? (
                  <span className="font-jp text-slate-600 dark:text-slate-300"> ({wrongFeedback.item.r})</span>
                ) : null}
              </div>
              <div className="text-emerald-800 dark:text-emerald-300 font-semibold">{wrongFeedback.item.m}</div>
            </div>

            <div className="rounded-xl border border-rose-200 dark:border-rose-800/80 bg-white dark:bg-slate-900 p-3 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Pilihanmu
              </div>
              <div className="text-slate-900 dark:text-slate-50">
                <strong className="font-jp text-base text-rose-800 dark:text-rose-300">
                  {wrongFeedback.chosenLabel}
                </strong>
                {wrongFeedback.type === 'k2m' ? (
                  <span className="font-jp text-slate-600 dark:text-slate-300">
                    {' '}
                    ← {wrongFeedback.chosen.k}
                    {wrongFeedback.chosen.r && wrongFeedback.chosen.r !== wrongFeedback.chosen.k
                      ? ` (${wrongFeedback.chosen.r})`
                      : ''}
                  </span>
                ) : wrongFeedback.chosen.r && wrongFeedback.chosen.r !== wrongFeedback.chosenLabel ? (
                  <span className="font-jp text-slate-600 dark:text-slate-300"> ({wrongFeedback.chosen.r})</span>
                ) : null}
              </div>
              {wrongFeedback.type !== 'k2m' ? (
                <div className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
                  Artinya:{' '}
                  <span className="font-medium text-slate-800 dark:text-slate-100">{wrongFeedback.chosen.m}</span>
                </div>
              ) : null}
            </div>
          </div>

          {wrongFeedback.type === 'ex2k' && wrongFeedback.item.ex ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
              <p className="font-jp font-semibold text-slate-900 dark:text-slate-50">{wrongFeedback.item.ex}</p>
              {wrongFeedback.item.exi ? (
                <p className="text-slate-600 dark:text-slate-300 mt-0.5">{wrongFeedback.item.exi}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="hidden md:block text-center text-xs text-slate-500 dark:text-slate-400">
        {wrongFeedback
          ? 'Tekan Enter atau Spasi untuk lanjut ke soal berikutnya.'
          : 'Tekan tombol A–D atau 1–4 pada keyboard untuk memilih jawaban.'}
      </p>
    </section>
  );
}
