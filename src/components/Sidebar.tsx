import { BookOpen, HelpCircle, Layers } from 'lucide-react';
import { KANJI, LEVEL_KEYS, LEVELS } from '../data/kanjiData';
import type { AppTab, LevelFilter } from '../types/kanji';

interface SidebarProps {
  activeTab: AppTab;
  levelFilter: LevelFilter;
  onSelectTab: (tab: AppTab) => void;
  onSelectLevel: (level: LevelFilter) => void;
}

export function Sidebar({
  activeTab,
  levelFilter,
  onSelectTab,
  onSelectLevel,
}: SidebarProps) {
  const levelKeys: LevelFilter[] = ['all', ...LEVEL_KEYS];
  const counts: Record<LevelFilter, number> = {
    all: KANJI.length,
    easy: KANJI.filter(it => it.dif === 'easy').length,
    medium: KANJI.filter(it => it.dif === 'medium').length,
    hard: KANJI.filter(it => it.dif === 'hard').length,
  };

  const tabs: { key: AppTab; label: string; icon: typeof Layers }[] = [
    { key: 'card', label: 'Kartu', icon: Layers },
    { key: 'list', label: 'Daftar', icon: BookOpen },
    { key: 'quiz', label: 'Kuis', icon: HelpCircle },
  ];

  return (
    <aside className="lg:sticky lg:top-22 lg:self-start space-y-4">
      <nav
        aria-label="Tampilan utama"
        role="tablist"
        className="grid grid-cols-3 lg:grid-cols-1 gap-1.5 bg-slate-200/70 p-1.5 rounded-xl"
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
              className={`min-h-[44px] px-3.5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center justify-center lg:justify-start gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                active
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

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
                className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-sm font-semibold inline-flex items-center justify-between gap-2.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                  active
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
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
                    active ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed px-1">
          {LEVELS[levelFilter].desc}
        </p>
      </div>
    </aside>
  );
}
