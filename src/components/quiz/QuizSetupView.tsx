import type { ReactNode, RefObject } from 'react';
import { HelpCircle } from 'lucide-react';
import { IRODORI_CHAPTER_NUMBERS } from '../../data/irodoriShared';
import type {
  AppDatasetMode,
  IrodoriBookConfig,
  IrodoriChapterNumber,
  QuizTypeChoice,
} from '../../types/kanji';
import { PRESET_COUNTS, QUIZ_TYPE_OPTIONS } from './quizHelpers';

interface QuizSetupViewProps {
  datasetMode: AppDatasetMode;
  irodoriBook: IrodoriBookConfig;
  selectedChapters: IrodoriChapterNumber[];
  chapterCounts: Record<IrodoriChapterNumber, number>;
  quizTypeChoice: QuizTypeChoice;
  showFurigana: boolean;
  activeScopeLabel: string;
  kanjiCount: number;
  modelCount: number;
  totalBank: number;
  hasKanaFilteredModels: boolean;
  disabledPresets: readonly number[];
  customCount: string;
  customInputRef: RefObject<HTMLInputElement | null>;
  onSelectChapters: (chapters: IrodoriChapterNumber[]) => void;
  onToggleChapter: (ch: IrodoriChapterNumber) => void;
  onSelectQuizType: (choice: QuizTypeChoice) => void;
  onToggleFurigana: () => void;
  onCustomCountChange: (value: string) => void;
  onStartQuiz: (requested: number | 'all') => void;
  performancePanel: ReactNode;
}

export function QuizSetupView({
  datasetMode,
  irodoriBook,
  selectedChapters,
  chapterCounts,
  quizTypeChoice,
  showFurigana,
  activeScopeLabel,
  kanjiCount,
  modelCount,
  totalBank,
  hasKanaFilteredModels,
  disabledPresets,
  customCount,
  customInputRef,
  onSelectChapters,
  onToggleChapter,
  onSelectQuizType,
  onToggleFurigana,
  onCustomCountChange,
  onStartQuiz,
  performancePanel,
}: QuizSetupViewProps) {
  return (
    <section aria-label="Pengaturan Kuis ABC" className="max-w-3xl space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
            <span>
              {datasetMode === 'irodori'
                ? `Kuis Kotoba & Kanji ${irodoriBook.label}`
                : 'Kuis ABC Multi-Model'}
            </span>
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Setiap {datasetMode === 'irodori' ? 'kosakata' : 'kanji'} memiliki hingga 5 variasi
            soal otomatis. Untuk soal melengkapi kalimat, pilihan jawaban sudah disesuaikan dengan{' '}
            <strong className="text-slate-900 dark:text-slate-100">konjugasi</strong> dan kelas kata dalam pilihan yang aktif.
          </p>
        </div>

        {datasetMode === 'irodori' ? (
          <div
            id="quizChapterPicker"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Pilih Bab Materi Kuis</span>
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 font-mono-num">
                  {selectedChapters.length}/{IRODORI_CHAPTER_NUMBERS.length} bab
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  id="btnQuizSelectAllChapters"
                  onClick={() => onSelectChapters([...IRODORI_CHAPTER_NUMBERS])}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    selectedChapters.length === IRODORI_CHAPTER_NUMBERS.length
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Semua Bab
                </button>
                <button
                  type="button"
                  id="btnQuizSelectFirstHalf"
                  onClick={() => onSelectChapters(IRODORI_CHAPTER_NUMBERS.filter(ch => ch <= 9))}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Bab 1–9
                </button>
                <button
                  type="button"
                  id="btnQuizSelectSecondHalf"
                  onClick={() => onSelectChapters(IRODORI_CHAPTER_NUMBERS.filter(ch => ch >= 10))}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Bab 10–18
                </button>
                <button
                  type="button"
                  id="btnQuizClearChapters"
                  onClick={() => onSelectChapters([])}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Klik satu atau beberapa bab untuk menggabungkan materi kuis sesuai kebutuhan belajar.
            </p>

            <div
              id="quizChapterGrid"
              className="grid grid-cols-3 sm:grid-cols-6 gap-1.5"
              role="group"
              aria-label="Pilihan bab materi kuis"
            >
              {IRODORI_CHAPTER_NUMBERS.map(ch => {
                const isSelected = selectedChapters.includes(ch);
                const meta = irodoriBook.chapters[ch];
                const count = chapterCounts[ch] ?? 0;
                return (
                  <button
                    key={ch}
                    type="button"
                    aria-pressed={isSelected}
                    title={`${meta.label}: ${meta.jpTitle} — ${meta.idTitle} (${count} kosakata)`}
                    onClick={() => onToggleChapter(ch)}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-between gap-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span>Bab {ch}</span>
                    <span
                      className={`text-[11px] font-mono-num ${
                        isSelected ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" id="quizTypeGrid">
          {QUIZ_TYPE_OPTIONS.map(opt => {
            const active = quizTypeChoice === opt.key;
            const optionLabel =
              datasetMode === 'irodori'
                ? opt.key === 'k2m'
                  ? 'Kosakata → Arti'
                  : opt.key === 'm2k'
                    ? 'Arti → Kosakata'
                    : opt.key === 'ex2k'
                      ? 'Contoh Kalimat → Kosakata (Sesuai Konjugasi)'
                      : opt.label
                : opt.label;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSelectQuizType(opt.key)}
                className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left text-sm font-semibold inline-flex items-center gap-2.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                  opt.fullWidth ? 'sm:col-span-2' : ''
                } ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-800 dark:text-indigo-200'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-jp text-xs font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                  {opt.short}
                </span>
                <span>{optionLabel}</span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Bantuan Furigana{' '}
              <span className="font-jp font-semibold text-indigo-700 dark:text-indigo-300">(ふりがな)</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
              Opsional — tampilkan cara baca hiragana di atas kanji pada soal{' '}
              <strong className="text-slate-800 dark:text-slate-100">{datasetMode === 'irodori' ? 'Arti ↔ Kosakata' : 'Arti ↔ Kanji'}</strong>{' '}
              (漢→ID &amp; ID→漢).
            </p>
          </div>
          <button
            type="button"
            id="btnToggleQuizFurigana"
            aria-pressed={showFurigana}
            onClick={onToggleFurigana}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              showFurigana
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {showFurigana ? 'Furigana: Aktif' : 'Furigana: Mati'}
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300">
          Bank soal aktif:{' '}
          <strong className="text-slate-900 dark:text-slate-50 font-mono-num">
            {hasKanaFilteredModels
              ? `${activeScopeLabel} (${totalBank.toLocaleString('id-ID')} soal unik)`
              : `${activeScopeLabel} (${kanjiCount} ${datasetMode === 'irodori' ? 'kosakata' : 'kanji'} × ${modelCount} model = ${totalBank.toLocaleString('id-ID')} soal unik)`}
          </strong>
          {hasKanaFilteredModels
            ? ' · kosakata tanpa kanji & kalimat penuh otomatis dilewati pada model 漢↔あ agar soal selalu relevan.'
            : '.'}
        </p>

        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2.5">Pilih jumlah soal:</div>
          <div className="grid grid-cols-3 gap-2.5">
            {PRESET_COUNTS.map(cnt => (
              <button
                key={cnt}
                type="button"
                disabled={cnt > totalBank}
                onClick={() => onStartQuiz(cnt)}
                className="min-h-[46px] px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold font-mono-num transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                {cnt} soal
              </button>
            ))}
            <button
              type="button"
              id="btnQuizAllBank"
              disabled={totalBank === 0}
              onClick={() => onStartQuiz('all')}
              className="min-h-[46px] px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold font-mono-num transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
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
              onChange={e => onCustomCountChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const parsed = parseInt(customCount, 10);
                  if (parsed >= 1) onStartQuiz(parsed);
                }
              }}
              placeholder={`Atau ketik jumlah soal (1–${totalBank})…`}
              aria-label="Jumlah soal kuis kustom"
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              id="btnStartCustomQuiz"
              disabled={totalBank === 0}
              onClick={() => {
                const parsed = parseInt(customCount, 10);
                if (!parsed || parsed < 1) {
                  customInputRef.current?.focus();
                  return;
                }
                onStartQuiz(parsed);
              }}
              className="min-h-[44px] px-5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              Mulai
            </button>
          </div>

          {totalBank === 0 ? (
            <p className="mt-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              {datasetMode === 'irodori' && selectedChapters.length === 0
                ? 'Pilih minimal 1 bab di atas untuk memulai kuis.'
                : 'Belum ada data kosakata pada pilihan ini untuk dijadikan kuis.'}
            </p>
          ) : disabledPresets.length > 0 ? (
            <p className="mt-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
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
