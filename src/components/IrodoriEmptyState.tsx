import { ArrowRight, BookOpen } from 'lucide-react';
import type { IrodoriBookConfig } from '../types/kanji';

interface IrodoriEmptyStateProps {
  book: IrodoriBookConfig;
  onSwitchToDasar1: () => void;
}

export function IrodoriEmptyState({
  book,
  onSwitchToDasar1,
}: IrodoriEmptyStateProps) {
  return (
    <section
      aria-label={`Status data ${book.label}`}
      id="irodoriEmptyState"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 text-center max-w-2xl"
    >
      <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 inline-flex items-center justify-center">
        <BookOpen className="w-6 h-6" aria-hidden="true" />
      </div>

      <p className="mt-4 text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
        {book.label} · <span className="font-jp">{book.jpTitle}</span> · {book.cefrLevel}
      </p>

      <h2 className="mt-1.5 text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
        Belum ada data
      </h2>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
        Materi kosakata dan kanji untuk <strong className="text-slate-900 dark:text-slate-100">{book.label}</strong> belum tersedia saat ini.
        Silakan buka <strong className="text-slate-900 dark:text-slate-100">Irodori Dasar 1</strong> yang sudah siap dipelajari.
      </p>

      <div className="mt-6">
        <button
          type="button"
          id="btnGoToIrodoriDasar1"
          onClick={onSwitchToDasar1}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-500"
        >
          <span>Buka Irodori Dasar 1</span>
          <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
