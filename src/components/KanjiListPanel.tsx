import { useMemo, useState } from 'react';
import { ChevronDown, Search, Volume2 } from 'lucide-react';
import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { IRODORI_CHAPTER_NUMBERS } from '../data/irodoriShared';
import { KANJI, LEVELS } from '../data/kanjiData';
import type {
  AppDatasetMode,
  IrodoriBookConfig,
  IrodoriChapterFilter,
  IrodoriChapterNumber,
  KanjiEntry,
  LevelFilter,
} from '../types/kanji';
import { speakJP } from '../utils/tts';

interface KanjiListPanelProps {
  datasetMode?: AppDatasetMode;
  irodoriBook?: IrodoriBookConfig;
  levelFilter: LevelFilter;
  chapterFilter?: IrodoriChapterFilter;
  mastered: Set<string>;
  hardSet: Set<string>;
}

export function KanjiListPanel({
  datasetMode = 'n4',
  irodoriBook = IRODORI_BOOKS.dasar1,
  levelFilter,
  chapterFilter = 'all',
  mastered,
  hardSet,
}: KanjiListPanelProps) {
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = datasetMode === 'irodori' ? irodoriBook.data : KANJI;

    return source.filter(it => {
      if (datasetMode === 'irodori') {
        if (chapterFilter !== 'all' && it.chapter !== chapterFilter) return false;
      } else {
        if (levelFilter !== 'all' && it.dif !== levelFilter) return false;
      }

      if (!q) return true;
      const chapterLabel = it.chapter ? `bab ${it.chapter}` : '';
      return (
        it.k.toLowerCase().includes(q) ||
        it.r.toLowerCase().includes(q) ||
        it.m.toLowerCase().includes(q) ||
        it.exi.toLowerCase().includes(q) ||
        (it.subSection?.toLowerCase().includes(q) ?? false) ||
        chapterLabel.includes(q)
      );
    });
  }, [datasetMode, irodoriBook.data, levelFilter, chapterFilter, query]);

  const groupedByChapter = useMemo(() => {
    if (datasetMode !== 'irodori') return [];
    const map = new Map<IrodoriChapterNumber, KanjiEntry[]>();
    for (const item of filteredItems) {
      if (!item.chapter) continue;
      const arr = map.get(item.chapter);
      if (arr) arr.push(item);
      else map.set(item.chapter, [item]);
    }
    return IRODORI_CHAPTER_NUMBERS.map(ch => ({
      chapter: ch,
      meta: irodoriBook.chapters[ch],
      items: map.get(ch) ?? [],
    })).filter(g => g.items.length > 0);
  }, [datasetMode, irodoriBook.chapters, filteredItems]);

  const toggleOpen = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCard = (item: KanjiEntry) => {
    const isOpen = openIds.has(item.id);
    const isMastered = mastered.has(item.id);
    const isHard = hardSet.has(item.id);
    const isLongWord = item.k.length >= 5;

    return (
      <div
        key={item.id}
        className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 transition-colors hover:border-slate-300"
      >
        <div className="flex items-start justify-between gap-2.5 sm:gap-3">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => toggleOpen(item.id)}
            className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 rounded-lg"
          >
            <span
              className={`font-jp font-bold text-slate-900 shrink-0 text-center break-words leading-snug ${
                datasetMode === 'irodori'
                  ? isLongWord
                    ? 'text-base sm:text-lg w-20 sm:w-24'
                    : 'text-xl sm:text-2xl w-20 sm:w-24'
                  : 'text-2xl sm:text-3xl min-w-[3.5rem]'
              }`}
            >
              {item.k}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-jp text-sm sm:text-base font-bold text-slate-900 truncate">
                {item.r}
                {item.accent ? (
                  <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                    {item.accent}
                  </span>
                ) : null}
              </div>
              <div className="text-xs sm:text-sm text-slate-600 line-clamp-2">{item.m}</div>
              <div className="mt-1 text-xs font-medium text-slate-500 flex flex-wrap items-center gap-1.5">
                {datasetMode === 'irodori' ? (
                  <span className="truncate max-w-full">
                    {item.subSection ?? (item.chapter ? `Bab ${item.chapter}` : '')}
                  </span>
                ) : (
                  <span>{LEVELS[item.dif].label}</span>
                )}
                {isMastered ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 font-semibold">✓ Hafal</span>
                  </>
                ) : null}
                {isHard ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-semibold">⚠ Sulit</span>
                  </>
                ) : null}
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            aria-label={`Putar pelafalan ${item.k}`}
            onClick={() => speakJP(item.r)}
            className="min-h-[40px] min-w-[40px] rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 inline-flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {isOpen ? (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-jp text-sm sm:text-base text-slate-900 leading-relaxed">
                {item.ex}
              </p>
              <button
                type="button"
                onClick={() => speakJP(item.ex)}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kalimat</span>
              </button>
            </div>
            <p className="text-xs sm:text-sm text-slate-600">{item.exi}</p>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section
      aria-label={
        datasetMode === 'irodori' ? 'Daftar Kosakata dan Kanji Irodori' : 'Daftar Kosakata Kanji'
      }
      className="space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Ketuk baris untuk melihat contoh kalimat. Progres tersimpan di perangkat ini.
        </p>
        <span className="text-xs font-semibold text-slate-500 font-mono-num whitespace-nowrap">
          {filteredItems.length} kosakata
        </span>
      </div>

      <div className="relative max-w-xl">
        <Search
          className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          id="kanjiSearch"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={
            datasetMode === 'irodori'
              ? 'Cari kotoba, kanji, hiragana, atau arti…'
              : 'Cari kanji, hiragana, atau arti…'
          }
          aria-label="Cari kosakata"
          className="w-full min-h-[46px] pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm sm:text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-500">
          Tidak ada hasil untuk &ldquo;{query.trim()}&rdquo;.
        </div>
      ) : datasetMode === 'irodori' ? (
        <div className="space-y-6" id="kanjiList">
          {groupedByChapter.map(group => (
            <section
              key={group.chapter}
              aria-label={`${group.meta.label}: ${group.meta.idTitle}`}
              className="space-y-3"
            >
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-3 h-3 rounded-full shrink-0 mt-1.5"
                    style={{ backgroundColor: group.meta.dotColor }}
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                      {group.meta.label} · {group.meta.idTitle}
                    </h3>
                    <p className="text-xs text-slate-500">
                      <span className="font-jp font-semibold text-teal-700">
                        {group.meta.jpTitle}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>{group.meta.topicId}</span>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-600 font-mono-num shrink-0">
                  {group.items.length} kosakata
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.items.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="kanjiList">
          {filteredItems.map(renderCard)}
        </div>
      )}
    </section>
  );
}
