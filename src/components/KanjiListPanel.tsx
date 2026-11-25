import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Layers,
  RotateCcw,
  Search,
  Shuffle,
  Volume2,
} from 'lucide-react';
import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { IRODORI_CHAPTER_NUMBERS } from '../data/irodoriShared';
import { KANJI, LEVELS } from '../data/kanjiData';
import type {
  AppDatasetMode,
  CardStatusCategory,
  IrodoriBookConfig,
  IrodoriChapterFilter,
  IrodoriChapterNumber,
  IrodoriKanjiScope,
  KanjiEntry,
  LevelFilter,
} from '../types/kanji';
import {
  countItemStatuses,
  filterCardItems,
  formatSelectedStatusesLabel,
  reshuffleDifferent,
  shuffleItems,
  toggleCardStatusSelection,
} from '../utils/cardFilter';
import {
  getOutsideWhitelistKanji,
  matchesIrodoriKanjiScope,
} from '../utils/irodoriKanjiFilter';
import { speakJP } from '../utils/tts';

interface KanjiListPanelProps {
  datasetMode?: AppDatasetMode;
  irodoriBook?: IrodoriBookConfig;
  levelFilter: LevelFilter;
  chapterFilter?: IrodoriChapterFilter;
  irodoriKanjiScope?: IrodoriKanjiScope;
  mastered: Set<string>;
  hardSet: Set<string>;
}

export function KanjiListPanel({
  datasetMode = 'n4',
  irodoriBook = IRODORI_BOOKS.dasar1,
  levelFilter,
  chapterFilter = 'all',
  irodoriKanjiScope = 'all',
  mastered,
  hardSet,
}: KanjiListPanelProps) {
  const [query, setQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<CardStatusCategory[]>([]);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [shuffledIdOrder, setShuffledIdOrder] = useState<string[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const baseFilteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = datasetMode === 'irodori' ? irodoriBook.data : KANJI;

    return source.filter(it => {
      if (datasetMode === 'irodori') {
        if (chapterFilter !== 'all' && it.chapter !== chapterFilter) return false;
        if (!matchesIrodoriKanjiScope(it, irodoriKanjiScope)) return false;
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
        (it.romaji?.toLowerCase().includes(q) ?? false) ||
        (it.subSection?.toLowerCase().includes(q) ?? false) ||
        chapterLabel.includes(q)
      );
    });
  }, [datasetMode, irodoriBook.data, levelFilter, chapterFilter, irodoriKanjiScope, query]);

  const statusCounts = useMemo(
    () => countItemStatuses(baseFilteredItems, mastered, hardSet),
    [baseFilteredItems, mastered, hardSet]
  );

  const statusFilteredItems = useMemo(
    () => filterCardItems(baseFilteredItems, selectedStatuses, mastered, hardSet),
    [baseFilteredItems, selectedStatuses, mastered, hardSet]
  );

  useEffect(() => {
    if (!shuffleOn) return;
    setShuffledIdOrder(prev => {
      const prevSet = new Set(prev);
      const hasAllCurrent = statusFilteredItems.every(it => prevSet.has(it.id));
      if (hasAllCurrent && prev.length > 0) return prev;
      return shuffleItems(statusFilteredItems).map(it => it.id);
    });
  }, [shuffleOn, statusFilteredItems]);

  const displayedItems = useMemo(() => {
    if (!shuffleOn) return statusFilteredItems;
    const rank = new Map<string, number>();
    shuffledIdOrder.forEach((id, idx) => rank.set(id, idx));
    return statusFilteredItems
      .slice()
      .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }, [shuffleOn, statusFilteredItems, shuffledIdOrder]);

  const handleSelectAllStatuses = () => {
    if (selectedStatuses.length === 0) return;
    setSelectedStatuses([]);
    if (shuffleOn) {
      setShuffledIdOrder(shuffleItems(baseFilteredItems).map(it => it.id));
    }
  };

  const handleToggleStatusCategory = (category: CardStatusCategory) => {
    const nextSelection = toggleCardStatusSelection(selectedStatuses, category);
    setSelectedStatuses(nextSelection);
    if (shuffleOn) {
      const nextItems = filterCardItems(baseFilteredItems, nextSelection, mastered, hardSet);
      setShuffledIdOrder(shuffleItems(nextItems).map(it => it.id));
    }
  };

  const handleToggleShuffle = () => {
    const nextShuffle = !shuffleOn;
    setShuffleOn(nextShuffle);
    if (nextShuffle) {
      setShuffledIdOrder(
        reshuffleDifferent(statusFilteredItems, statusFilteredItems, it => it.id).map(it => it.id)
      );
    }
  };

  const handleReshuffle = () => {
    setShuffledIdOrder(
      reshuffleDifferent(displayedItems, displayedItems, it => it.id).map(it => it.id)
    );
  };

  const groupedByChapter = useMemo(() => {
    if (datasetMode !== 'irodori' || shuffleOn) return [];
    const map = new Map<IrodoriChapterNumber, KanjiEntry[]>();
    for (const item of displayedItems) {
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
  }, [datasetMode, shuffleOn, irodoriBook.chapters, displayedItems]);

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
    const outsideWhitelistKanji =
      datasetMode === 'irodori' ? getOutsideWhitelistKanji(item) : [];
    const isAdvancedKanji = outsideWhitelistKanji.length > 0;

    return (
      <div
        key={item.id}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
      >
        <div className="flex items-start justify-between gap-2.5 sm:gap-3">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => toggleOpen(item.id)}
            className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 rounded-lg"
          >
            <span
              className={`font-jp font-bold text-slate-900 dark:text-slate-50 shrink-0 text-center break-words leading-snug ${
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
              <div className="font-jp text-sm sm:text-base font-bold text-slate-900 dark:text-slate-50 truncate">
                {item.r}
                {item.accent ? (
                  <span className="ml-1.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    {item.accent}
                  </span>
                ) : null}
              </div>
              {item.romaji ? (
                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                  {item.romaji}
                </div>
              ) : null}
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{item.m}</div>
              <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                {datasetMode === 'irodori' ? (
                  <span className="truncate max-w-full">
                    {item.subSection ?? (item.chapter ? `Bab ${item.chapter}` : '')}
                  </span>
                ) : (
                  <span>{LEVELS[item.dif].label}</span>
                )}
                {item.kanjiList && item.kanjiList.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-jp text-teal-700 dark:text-teal-300 font-semibold">
                      Kanji: {item.kanjiList.join(' ')}
                    </span>
                  </>
                ) : null}
                {isAdvancedKanji ? (
                  <span
                    title={`Kanji di luar daftar acuan N4/JFT: ${outsideWhitelistKanji.join('、')}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md border border-violet-200 dark:border-violet-700/80 bg-violet-50 dark:bg-violet-950/80 text-[11px] font-bold text-violet-800 dark:text-violet-200 whitespace-nowrap"
                  >
                    Kanji Lanjutan
                  </span>
                ) : null}
                {isMastered ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">✓ Hafal</span>
                  </>
                ) : null}
                {isHard ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 dark:text-amber-400 font-semibold">⚠ Sulit</span>
                  </>
                ) : null}
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            aria-label={`Putar pelafalan ${item.k}`}
            onClick={() => speakJP(item.r)}
            className="min-h-[40px] min-w-[40px] rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-200 inline-flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {isOpen ? (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-jp text-sm sm:text-base text-slate-900 dark:text-slate-50 leading-relaxed">
                {item.ex}
              </p>
              <button
                type="button"
                onClick={() => speakJP(item.ex)}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kalimat</span>
              </button>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{item.exi}</p>
          </div>
        ) : null}
      </div>
    );
  };

  const isAllStatuses = selectedStatuses.length === 0;
  const activeFilterLabel = formatSelectedStatusesLabel(selectedStatuses);

  const listStatusCategoryOptions: {
    key: CardStatusCategory;
    id: string;
    label: string;
    title: string;
    count: number;
    activeClass: string;
    checkClass: string;
    icon: typeof CircleDashed;
  }[] = [
    {
      key: 'unmarked',
      id: 'btnListFilterUnmarked',
      label: 'Belum ditandai',
      title: 'Belum ditandai hafal maupun sulit (bisa digabung dengan kategori lain)',
      count: statusCounts.unmarked,
      activeClass:
        'bg-sky-50 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600 text-sky-900 dark:text-sky-100',
      checkClass: 'bg-sky-600 text-white',
      icon: CircleDashed,
    },
    {
      key: 'mastered',
      id: 'btnListFilterMastered',
      label: 'Sudah hafal',
      title: 'Sudah ditandai hafal (bisa digabung dengan kategori lain)',
      count: statusCounts.mastered,
      activeClass:
        'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-600 text-emerald-900 dark:text-emerald-100',
      checkClass: 'bg-emerald-600 text-white',
      icon: CheckCircle2,
    },
    {
      key: 'hard',
      id: 'btnListFilterHard',
      label: 'Sulit',
      title: 'Ditandai sulit, terpisah dari belum ditandai (bisa digabung dengan kategori lain)',
      count: statusCounts.hard,
      activeClass:
        'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-100',
      checkClass: 'bg-amber-500 text-white',
      icon: AlertTriangle,
    },
  ];

  const nounLabel = datasetMode === 'irodori' ? 'kosakata' : 'kanji';

  return (
    <section
      aria-label={
        datasetMode === 'irodori' ? 'Daftar Kosakata dan Kanji Irodori' : 'Daftar Kosakata Kanji'
      }
      className="space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Ketuk baris untuk melihat contoh kalimat. Progres tersimpan di perangkat ini.
        </p>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono-num whitespace-nowrap">
          {displayedItems.length} kosakata
        </span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xl">
          <Search
            className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
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
            className="w-full min-h-[44px] pl-11 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="btnListShuffle"
            aria-pressed={shuffleOn}
            onClick={handleToggleShuffle}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              shuffleOn
                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-200'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Shuffle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Acak: {shuffleOn ? 'nyala' : 'mati'}</span>
          </button>

          {shuffleOn && displayedItems.length > 1 ? (
            <button
              type="button"
              id="btnListReshuffle"
              onClick={handleReshuffle}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Acak ulang</span>
            </button>
          ) : null}
        </div>
      </div>

      <div
        role="group"
        aria-label="Filter status hafalan daftar (bisa pilih lebih dari satu)"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          id="btnListFilterAll"
          aria-pressed={isAllStatuses}
          onClick={handleSelectAllStatuses}
          className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
            isAllStatuses
              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-600 text-indigo-800 dark:text-indigo-200'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Semua</span>
          <span className="font-mono-num text-[11px] opacity-80">({statusCounts.all})</span>
        </button>

        {listStatusCategoryOptions.map(opt => {
          const Icon = opt.icon;
          const active = selectedStatuses.includes(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              id={opt.id}
              title={opt.title}
              aria-pressed={active}
              onClick={() => handleToggleStatusCategory(opt.key)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                active
                  ? opt.activeClass
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded-md inline-flex items-center justify-center shrink-0 ${opt.checkClass}`}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              ) : (
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{opt.label}</span>
              <span className="font-mono-num text-[11px] opacity-80">({opt.count})</span>
            </button>
          );
        })}

        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 select-none pl-0.5">
          · bisa pilih lebih dari 1
        </span>
      </div>

      {displayedItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-4">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {query.trim()
              ? `Tidak ada hasil untuk “${query.trim()}” pada filter ini.`
              : !isAllStatuses
                ? selectedStatuses.length === 1 && selectedStatuses[0] === 'hard'
                  ? `Belum ada ${nounLabel} sulit yang ditandai.`
                  : selectedStatuses.length === 1 && selectedStatuses[0] === 'mastered'
                    ? `Belum ada ${nounLabel} yang ditandai hafal.`
                    : selectedStatuses.length === 1 && selectedStatuses[0] === 'unmarked'
                      ? `Semua ${nounLabel} pada pilihan ini sudah ditandai (hafal atau sulit)!`
                      : `Belum ada ${nounLabel} pada filter ${activeFilterLabel}.`
                : irodoriKanjiScope !== 'all'
                  ? 'Tidak ada kosakata yang cocok untuk filter Kanji dan bab yang dipilih.'
                  : 'Belum ada data kosakata pada bab ini.'}
          </p>
          {!isAllStatuses ? (
            <button
              type="button"
              id="btnListShowAll"
              onClick={handleSelectAllStatuses}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              Tampilkan semua
            </button>
          ) : null}
        </div>
      ) : datasetMode === 'irodori' && !shuffleOn ? (
        <div className="space-y-6" id="kanjiList">
          {groupedByChapter.map(group => (
            <section
              key={group.chapter}
              aria-label={`${group.meta.label}: ${group.meta.idTitle}`}
              className="space-y-3"
            >
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-3 h-3 rounded-full shrink-0 mt-1.5"
                    style={{ backgroundColor: group.meta.dotColor }}
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-50">
                      {group.meta.label} · {group.meta.idTitle}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-jp font-semibold text-teal-700 dark:text-teal-300">
                        {group.meta.jpTitle}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>{group.meta.topicId}</span>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 font-mono-num shrink-0">
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
          {displayedItems.map(renderCard)}
        </div>
      )}
    </section>
  );
}
