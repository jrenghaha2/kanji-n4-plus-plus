import { BookOpen } from 'lucide-react';
import { IRODORI_BOOKS, IRODORI_BOOK_ORDER } from '../data/irodoriBooks';
import type { IrodoriBookId } from '../types/kanji';

interface IrodoriBookMenuProps {
  selectedBookId: IrodoriBookId;
  onSelectBook: (bookId: IrodoriBookId) => void;
}

export function IrodoriBookMenu({
  selectedBookId,
  onSelectBook,
}: IrodoriBookMenuProps) {
  return (
    <section
      aria-label="Sub-menu buku Irodori"
      className="mb-5 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4"
    >
      <div className="flex items-center gap-2.5 px-1.5 min-w-0">
        <BookOpen className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900">
            Pilih Buku Irodori
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            Seri buku JF Irodori · Pemula, Dasar 1, dan Dasar 2
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Daftar buku Irodori"
        className="grid grid-cols-3 gap-1 sm:gap-1.5 rounded-xl bg-slate-100 p-1 w-full md:w-auto md:min-w-[440px]"
      >
        {IRODORI_BOOK_ORDER.map(bookId => {
          const book = IRODORI_BOOKS[bookId];
          const active = selectedBookId === bookId;
          const hasData = book.data.length > 0;

          return (
            <button
              key={book.id}
              type="button"
              id={`btnIrodoriBook-${book.id}`}
              role="tab"
              aria-selected={active}
              onClick={() => onSelectBook(book.id)}
              className={`min-h-[46px] px-2 sm:px-3.5 py-1.5 rounded-lg text-center transition-colors flex flex-col items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600 ${
                active
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span className="text-xs sm:text-sm font-bold whitespace-nowrap">
                {book.shortLabel}
              </span>
              <span
                className={`text-[10px] sm:text-[11px] font-medium font-mono-num whitespace-nowrap ${
                  hasData
                    ? active
                      ? 'text-teal-700'
                      : 'text-slate-500'
                    : active
                      ? 'text-amber-700'
                      : 'text-slate-400'
                }`}
              >
                {hasData ? `${book.data.length} kata` : 'Belum ada data'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
