import { useMemo } from 'react';
import { BookOpen, FileText, HelpCircle, Layers } from 'lucide-react';
import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { IRODORI_CHAPTER_NUMBERS } from '../data/irodoriShared';
import { KANJI, LEVEL_KEYS, LEVELS } from '../data/kanjiData';
import type {
  AppDatasetMode,
  AppTab,
  IrodoriBookConfig,
  IrodoriChapterFilter,
  IrodoriChapterNumber,
  IrodoriKanjiScope,
  LevelFilter,
} from '../types/kanji';
import {
  IRODORI_KANJI_SCOPE_META,
  matchesIrodoriKanjiScope,
} from '../utils/irodoriKanjiFilter';

interface SidebarProps {
  datasetMode: AppDatasetMode;
  irodoriBook?: IrodoriBookConfig;
  activeTab: AppTab;
  levelFilter: LevelFilter;
  chapterFilter: IrodoriChapterFilter;
  irodoriKanjiScope?: IrodoriKanjiScope;
  onSelectTab: (tab: AppTab) => void;
  onSelectLevel: (level: LevelFilter) => void;
  onSelectChapter: (chapter: IrodoriChapterFilter) => void;
}

export function Sidebar({
  datasetMode,
  irodoriBook = IRODORI_BOOKS.dasar1,
  activeTab,
  levelFilter,
  chapterFilter,
  irodoriKanjiScope = 'all',
  onSelectTab,
  onSelectLevel,
  onSelectChapter,
}: SidebarProps) {
  const levelKeys: LevelFilter[] = ['all', ...LEVEL_KEYS];
  const counts: Record<LevelFilter, number> = useMemo(
    () => ({
      all: KANJI.length,
      easy: KANJI.filter(it => it.dif === 'easy').length,
      medium: KANJI.filter(it => it.dif === 'medium').length,
      hard: KANJI.filter(it => it.dif === 'hard').length,
    }),
    []
  );

  const { chapterCounts, filteredIrodoriTotal } = useMemo(() => {
    const map = new Map<IrodoriChapterNumber, number>();
    for (const ch of IRODORI_CHAPTER_NUMBERS) map.set(ch, 0);
    let total = 0;
    for (const it of irodoriBook.data) {
      if (!matchesIrodoriKanjiScope(it, irodoriKanjiScope)) continue;
      total++;
      if (it.chapter) {
        map.set(it.chapter, (map.get(it.chapter) ?? 0) + 1);
      }
    }
    return { chapterCounts: map, filteredIrodoriTotal: total };
  }, [irodoriBook.data, irodoriKanjiScope]);

  const topicGroups = useMemo(() => {
    const groups: { topicJp: string; topicId: string; chapters: IrodoriChapterNumber[] }[] = [];
    for (const ch of IRODORI_CHAPTER_NUMBERS) {
      const meta = irodoriBook.chapters[ch];
      const existing = groups.find(g => g.topicId === meta.topicId);
      if (existing) {
        existing.chapters.push(ch);
      } else {
        groups.push({ topicJp: meta.topicJp, topicId: meta.topicId, chapters: [ch] });
      }
    }
    return groups;
  }, [irodoriBook.chapters]);

  const tabs: { key: AppTab; label: string; icon: typeof Layers }[] = [
    { key: 'card', label: 'Kartu', icon: Layers },
    { key: 'list', label: 'Daftar', icon: BookOpen },
    { key: 'quiz', label: 'Kuis', icon: HelpCircle },
  ];

  const activeChapterMeta =
    chapterFilter === 'all' ? null : irodoriBook.chapters[chapterFilter];
  const hasIrodoriData = irodoriBook.data.length > 0;

  return (
    <aside className="lg:sticky lg:top-22 lg:self-start space-y-4">
      <nav
        aria-label="Tampilan utama"
        role="tablist"
        className="grid grid-cols-3 lg:grid-cols-1 gap-1.5 bg-slate-200/70 dark:bg-slate-800/80 p-1.5 rounded-xl"
      >
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectTab(key)}
              className={`min-h-[44px] px-3.5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center justify-center lg:justify-start gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                active
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-white/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {datasetMode === 'n4' ? (
        <div>
          <div
            role="tablist"
            aria-label="Level kesulitan"
            className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0"
          >
            {levelKeys.map(key => {
              const active = levelFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectLevel(key)}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-sm font-semibold inline-flex items-center justify-between gap-2.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-indigo-600 dark:border-indigo-500 dark:text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {key !== 'all' ? (
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: LEVELS[key].dotColor }}
                      />
                    ) : null}
                    <span>{LEVELS[key].label}</span>
                  </span>
                  <span
                    className={`text-xs font-mono-num ${
                      active ? 'text-slate-300 dark:text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed px-1">
            {LEVELS[levelFilter].desc}
          </p>
        </div>
      ) : !hasIrodoriData ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-1">
          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
            {irodoriBook.label} ({irodoriBook.cefrLevel})
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Belum ada data bab atau kosakata untuk buku ini.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile: horizontal scrollable chapter strip + quick select dropdown */}
          <div className="lg:hidden space-y-2.5">
            <div className="flex items-center gap-2">
              <label htmlFor="irodoriChapterSelect" className="sr-only">
                Pilih Bab Irodori
              </label>
              <select
                id="irodoriChapterSelect"
                value={chapterFilter === 'all' ? 'all' : String(chapterFilter)}
                onChange={e => {
                  const val = e.target.value;
                  onSelectChapter(
                    val === 'all' ? 'all' : (Number(val) as IrodoriChapterNumber)
                  );
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">Semua Bab (1–18 · {filteredIrodoriTotal} kosakata)</option>
                {IRODORI_CHAPTER_NUMBERS.map(ch => {
                  const meta = irodoriBook.chapters[ch];
                  return (
                    <option key={ch} value={String(ch)}>
                      {meta.label}: {meta.idTitle} ({chapterCounts.get(ch) ?? 0})
                    </option>
                  );
                })}
              </select>
            </div>

            <div
              role="tablist"
              aria-label="Filter Bab Irodori"
              className="flex gap-1.5 overflow-x-auto pb-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={chapterFilter === 'all'}
                onClick={() => onSelectChapter('all')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  chapterFilter === 'all'
                    ? 'bg-slate-900 border-slate-900 text-white dark:bg-teal-600 dark:border-teal-500 dark:text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>Semua</span>
                <span className="font-mono-num opacity-80">{filteredIrodoriTotal}</span>
              </button>
              {IRODORI_CHAPTER_NUMBERS.map(ch => {
                const active = chapterFilter === ch;
                const meta = irodoriBook.chapters[ch];
                return (
                  <button
                    key={ch}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onSelectChapter(ch)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-slate-900 border-slate-900 text-white dark:bg-teal-600 dark:border-teal-500 dark:text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: meta.dotColor }}
                    />
                    <span>{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop: grouped chapter list per topic */}
          <div className="hidden lg:block space-y-2.5">
            <button
              type="button"
              id="btnIrodoriAllChapters"
              onClick={() => onSelectChapter('all')}
              className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl border text-sm font-semibold inline-flex items-center justify-between gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                chapterFilter === 'all'
                  ? 'bg-slate-900 border-slate-900 text-white dark:bg-teal-600 dark:border-teal-500 dark:text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>Semua Bab (1–18)</span>
              <span
                className={`text-xs font-mono-num ${
                  chapterFilter === 'all' ? 'text-slate-300 dark:text-teal-100' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {filteredIrodoriTotal}
              </span>
            </button>

            <div
              role="tablist"
              aria-label="Daftar Bab Irodori"
              className="max-h-[calc(100vh-22rem)] overflow-y-auto pr-1 space-y-3"
            >
              {topicGroups.map(group => (
                <div key={group.topicId} className="space-y-1.5">
                  <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {group.topicId} · <span className="font-jp">{group.topicJp}</span>
                  </div>
                  {group.chapters.map(ch => {
                    const active = chapterFilter === ch;
                    const meta = irodoriBook.chapters[ch];
                    return (
                      <button
                        key={ch}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onSelectChapter(ch)}
                        className={`w-full px-3 py-2 rounded-xl border text-left transition-colors flex items-start justify-between gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                          active
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-teal-600 dark:border-teal-500 dark:text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-start gap-2 min-w-0">
                          <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                            style={{ backgroundColor: meta.dotColor }}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-bold">
                              {meta.label} · {meta.idTitle}
                            </span>
                            <span
                              className={`block text-[11px] font-jp truncate ${
                                active ? 'text-slate-300 dark:text-teal-100' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {meta.jpTitle}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`text-xs font-mono-num shrink-0 mt-0.5 ${
                            active ? 'text-slate-300 dark:text-teal-100' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {chapterCounts.get(ch) ?? 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1.5">
            {activeChapterMeta ? (
              <>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {activeChapterMeta.label}: {activeChapterMeta.idTitle}
                </div>
                <div className="text-xs font-jp text-teal-700 dark:text-teal-300 font-semibold">
                  {activeChapterMeta.jpTitle}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Topik: {activeChapterMeta.topicId} ({activeChapterMeta.topicJp})
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Menampilkan seluruh 18 bab {irodoriBook.label} ({filteredIrodoriTotal} kosakata
                {irodoriKanjiScope !== 'all'
                  ? ` · ${IRODORI_KANJI_SCOPE_META[irodoriKanjiScope].label}`
                  : ' & kanji'}
                ).
              </p>
            )}
            {irodoriBook.pdfPath ? (
              <a
                href={irodoriBook.pdfPath}
                target="_blank"
                rel="noopener noreferrer"
                className="pt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 hover:underline"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Buka Daftar Kosakata Resmi (PDF)</span>
              </a>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
