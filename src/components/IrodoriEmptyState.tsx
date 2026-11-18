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
      className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center max-w-2xl"
    >
      <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 inline-flex items-center justify-center">
        <BookOpen className="w-6 h-6" aria-hidden="true" />
      </div>

      <p className="mt-4 text-xs sm:text-sm font-semibold text-slate-500">
        {book.label} · <span className="font-jp">{book.jpTitle}</span> · {book.cefrLevel}
      </p>

      <h2 className="mt-1.5 text-xl sm:text-2xl font-bold text-slate-900">
        Belum ada data
      </h2>

      <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
        Materi kosakata dan kanji untuk <strong>{book.label}</strong> belum tersedia saat ini.
        Silakan buka <strong>Irodori Dasar 1</strong> yang sudah siap dipelajari.
      </p>

      <div className="mt-6">
        <button
          type="button"
          id="btnGoToIrodoriDasar1"
          onClick={onSwitchToDasar1}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <span>Buka Irodori Dasar 1</span>
          <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
