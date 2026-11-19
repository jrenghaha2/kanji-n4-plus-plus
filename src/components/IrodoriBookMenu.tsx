import { BookOpen, Filter } from 'lucide-react';
import { IRODORI_BOOKS, IRODORI_BOOK_ORDER } from '../data/irodoriBooks';
import type { IrodoriBookId, IrodoriKanjiScope } from '../types/kanji';
import {
  IRODORI_KANJI_SCOPE_META,
  IRODORI_KANJI_SCOPE_ORDER,
} from '../utils/irodoriKanjiFilter';

interface IrodoriBookMenuProps {
  selectedBookId: IrodoriBookId;
  onSelectBook: (bookId: IrodoriBookId) => void;
  kanjiScope: IrodoriKanjiScope;
  kanjiScopeCounts: Record<IrodoriKanjiScope, number>;
  kanjiScopeContextLabel?: string;
  onSelectKanjiScope: (scope: IrodoriKanjiScope) => void;
}

export function IrodoriBookMenu({
  selectedBookId,
  onSelectBook,
  kanjiScope,
  kanjiScopeCounts,
  kanjiScopeContextLabel,
  onSelectKanjiScope,
}: IrodoriBookMenuProps) {
  const activeBook = IRODORI_BOOKS[selectedBookId];
  const hasBookData = activeBook.data.length > 0;

  return (
    <section
      aria-label="Sub-menu buku Irodori dan filter level Kanji"
      className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 sm:p-3 space-y-2.5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4">
        <div className="flex items-center gap-2.5 px-1.5 min-w-0">
          <BookOpen
            className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              Pilih Buku Irodori
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              Seri buku JF Irodori · Pemula, Dasar 1, dan Dasar 2
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Daftar buku Irodori"
          className="grid grid-cols-3 gap-1 sm:gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 w-full md:w-auto md:min-w-[440px]"
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
                className={`min-h-[46px] px-2 sm:px-3.5 py-1.5 rounded-lg text-center transition-colors flex flex-col items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-500 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-white/60 dark:hover:bg-slate-700/60'
                }`}
              >
                <span className="text-xs sm:text-sm font-bold whitespace-nowrap">
                  {book.shortLabel}
                </span>
                <span
                  className={`text-[10px] sm:text-[11px] font-medium font-mono-num whitespace-nowrap ${
                    hasData
                      ? active
                        ? 'text-teal-700 dark:text-teal-300'
                        : 'text-slate-500 dark:text-slate-400'
                      : active
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {hasData ? `${book.data.length} kata` : 'Belum ada data'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {hasBookData ? (
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 px-1.5 min-w-0">
            <Filter
              className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                <span>Filter Level Kanji</span>
                {kanjiScopeContextLabel ? (
                  <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                    · {kanjiScopeContextLabel}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
                {IRODORI_KANJI_SCOPE_META[kanjiScope].description}
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Filter level Kanji Irodori"
            className="grid grid-cols-3 gap-1 sm:gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 w-full md:w-auto md:min-w-[440px]"
          >
            {IRODORI_KANJI_SCOPE_ORDER.map(scope => {
              const active = kanjiScope === scope;
              const meta = IRODORI_KANJI_SCOPE_META[scope];
              const count = kanjiScopeCounts[scope] ?? 0;

              const activeStyle =
                scope === 'jft'
                  ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-600 dark:text-white'
                  : scope === 'advanced'
                    ? 'bg-violet-600 text-white shadow-xs dark:bg-violet-600 dark:text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs';

              const countStyle = active
                ? scope === 'jft'
                  ? 'text-teal-100'
                  : scope === 'advanced'
                    ? 'text-violet-100'
                    : 'text-slate-600 dark:text-slate-300'
                : 'text-slate-500 dark:text-slate-400';

              return (
                <button
                  key={scope}
                  type="button"
                  id={`btnIrodoriKanjiScope-${scope}`}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectKanjiScope(scope)}
                  className={`min-h-[44px] px-2 sm:px-3 py-1.5 rounded-lg text-center transition-colors flex flex-col items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                    active
                      ? activeStyle
                      : 'text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-white/70 dark:hover:bg-slate-700/70'
                  }`}
                >
                  <span className="text-[11px] sm:text-xs font-bold whitespace-nowrap">
                    {meta.label}
                  </span>
                  <span
                    className={`text-[10px] sm:text-[11px] font-semibold font-mono-num whitespace-nowrap ${countStyle}`}
                  >
                    {count.toLocaleString('id-ID')} kata
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
