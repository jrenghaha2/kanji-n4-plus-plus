import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Layers,
  RotateCcw,
  Shuffle,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { KANJI, LEVELS } from '../data/kanjiData';
import type {
  AppDatasetMode,
  CardStatusCategory,
  CardStatusSelection,
  KanjiEntry,
  LevelFilter,
} from '../types/kanji';
import {
  type CardStatusCounts,
  formatSelectedStatusesLabel,
} from '../utils/cardFilter';
import { getOutsideWhitelistKanji } from '../utils/irodoriKanjiFilter';
import { speakJP } from '../utils/tts';

interface FlashcardPanelProps {
  datasetMode?: AppDatasetMode;
  dataset?: readonly KanjiEntry[];
  scopeLabel?: string;
  levelFilter: LevelFilter;
  order: number[];
  pos: number;
  flipped: boolean;
  selectedStatuses: CardStatusSelection;
  statusCounts: CardStatusCounts;
  shuffleOn: boolean;
  mastered: Set<string>;
  hardSet: Set<string>;
  levelHardCount: number;
  levelMasteredCount: number;
  sessionHardCount: number;
  sessionNewMaster: number;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onMarkMastered: () => void;
  onMarkHard: () => void;
  onForgetCurrent: () => void;
  onResetAllLevelMastered: () => void;
  onUnhardCurrent: () => void;
  onClearLevelHard: () => void;
  onSelectAllStatuses: () => void;
  onToggleStatusCategory: (category: CardStatusCategory) => void;
  onToggleShuffle: () => void;
  onReshuffle: () => void;
  onRestartSession: () => void;
  onRepeatSessionHard: () => void;
}

export function FlashcardPanel({
  datasetMode = 'n4',
  dataset = KANJI,
  scopeLabel,
  levelFilter,
  order,
  pos,
  flipped,
  selectedStatuses,
  statusCounts,
  shuffleOn,
  mastered,
  hardSet,
  levelHardCount,
  levelMasteredCount,
  sessionHardCount,
  sessionNewMaster,
  onFlip,
  onPrev,
  onNext,
  onMarkMastered,
  onMarkHard,
  onForgetCurrent,
  onResetAllLevelMastered,
  onUnhardCurrent,
  onClearLevelHard,
  onSelectAllStatuses,
  onToggleStatusCategory,
  onToggleShuffle,
  onReshuffle,
  onRestartSession,
  onRepeatSessionHard,
}: FlashcardPanelProps) {
  const [armedResetMastered, setArmedResetMastered] = useState(false);
  const [armedClearHard, setArmedClearHard] = useState(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const handleCardPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCardClick = (e: MouseEvent<HTMLDivElement>) => {
    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
      return;
    }
    const selectedText = typeof window !== 'undefined' ? window.getSelection()?.toString() : '';
    if (selectedText && selectedText.trim().length > 0) {
      return;
    }
    onFlip();
  };

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onFlip();
    }
  };

  useEffect(() => {
    if (!armedResetMastered) return;
    const t = setTimeout(() => setArmedResetMastered(false), 3000);
    return () => clearTimeout(t);
  }, [armedResetMastered]);

  useEffect(() => {
    if (!armedClearHard) return;
    const t = setTimeout(() => setArmedClearHard(false), 3000);
    return () => clearTimeout(t);
  }, [armedClearHard]);

  const total = order.length;
  const isDone = pos >= total;
  const currentItem = !isDone ? dataset[order[pos]] : null;
  const progressPct = total === 0 || isDone ? 100 : (pos / total) * 100;
  const levelLabel = scopeLabel ?? LEVELS[levelFilter].label;
  const kLen = currentItem?.k.length ?? 0;
  const outsideWhitelistKanji =
    datasetMode === 'irodori' && currentItem ? getOutsideWhitelistKanji(currentItem) : [];
  const isAdvancedKanji = outsideWhitelistKanji.length > 0;

  const confirmScopeLabel =
    datasetMode === 'irodori'
      ? `Yakin? (${levelLabel}) ketuk lagi`
      : levelFilter === 'all'
        ? 'Yakin? Ketuk lagi'
        : `Yakin? (level ${levelLabel}) ketuk lagi`;

  const isAllStatuses = selectedStatuses.length === 0;
  const activeFilterLabel = formatSelectedStatusesLabel(selectedStatuses);

  const statusCategoryOptions: {
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
      id: 'btnFilterUnmarked',
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
      id: 'btnFilterMastered',
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
      id: 'btnFilterHard',
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
  const scopeNoun = datasetMode === 'irodori' ? 'pilihan ini' : 'level ini';
  const onlyUnmarkedSelected =
    selectedStatuses.length === 1 && selectedStatuses[0] === 'unmarked';

  const emptyMessage = isAllStatuses
    ? 'Tidak ada kosakata yang cocok pada pilihan bab dan filter Kanji ini.'
    : onlyUnmarkedSelected
      ? `Semua ${nounLabel} di ${scopeNoun} sudah ditandai (hafal atau sulit)!`
      : selectedStatuses.length === 1 && selectedStatuses[0] === 'hard'
        ? `Belum ada ${nounLabel} sulit di ${scopeNoun}.`
        : selectedStatuses.length === 1 && selectedStatuses[0] === 'mastered'
          ? `Belum ada ${nounLabel} yang ditandai hafal di ${scopeNoun}.`
          : `Belum ada ${nounLabel} pada filter ${activeFilterLabel} di ${scopeNoun}.`;

  const emptyTitle = onlyUnmarkedSelected
    ? 'Semua sudah ditandai!'
    : isAllStatuses
      ? 'Belum ada data'
      : 'Belum ada kartu di filter ini';

  return (
    <section aria-label="Mode Kartu Flashcard" className="space-y-4">
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span
            className="text-sm font-semibold text-slate-600 dark:text-slate-300 font-mono-num"
            id="cardCounter"
          >
            {total === 0
              ? '0 kartu ditampilkan'
              : isDone
                ? `Selesai · ${total} kartu`
                : `Kartu ${pos + 1} dari ${total}`}
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btnShuffle"
              aria-pressed={shuffleOn}
              onClick={onToggleShuffle}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                shuffleOn
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-200'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Shuffle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Acak: {shuffleOn ? 'nyala' : 'mati'}</span>
            </button>

            {shuffleOn && total > 1 ? (
              <button
                type="button"
                id="btnReshuffle"
                onClick={onReshuffle}
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
          aria-label="Filter status hafalan kartu (bisa pilih lebih dari satu)"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            id="btnFilterAll"
            aria-pressed={isAllStatuses}
            onClick={onSelectAllStatuses}
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

          {statusCategoryOptions.map(opt => {
            const Icon = opt.icon;
            const active = selectedStatuses.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                id={opt.id}
                title={opt.title}
                aria-pressed={active}
                onClick={() => onToggleStatusCategory(opt.key)}
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
      </div>

      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {isDone ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xs">
          <div className="text-4xl" aria-hidden="true">
            {total === 0 && !onlyUnmarkedSelected ? '📚' : '🎉'}
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-50">
            {total === 0 ? emptyTitle : 'Sesi selesai!'}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 font-medium">
            {total === 0
              ? emptyMessage
              : `${total} kartu diulas · ${sessionNewMaster} hafal baru · ${sessionHardCount} ditandai sulit`}
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            {total === 0 && !isAllStatuses ? (
              <button
                type="button"
                id="btnShowAllCards"
                onClick={onSelectAllStatuses}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                Tampilkan semua kartu
              </button>
            ) : (
              <>
                {sessionHardCount > 0 ? (
                  <button
                    type="button"
                    onClick={onRepeatSessionHard}
                    className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    <span>Ulangi kartu sulit ({sessionHardCount})</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onRestartSession}
                  className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  Mulai sesi baru
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          {/* Card Stage */}
          <div className="perspective-card">
            <div
              id="flashcard"
              className={`preserve-3d relative w-full h-[270px] sm:h-[380px] rounded-2xl ${
                flipped ? 'is-flipped' : ''
              }`}
            >
              {/* Front Face */}
              <div
                className={`backface-hidden absolute inset-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${
                  flipped ? 'pointer-events-none' : 'pointer-events-auto'
                }`}
              >
                {isAdvancedKanji ? (
                  <span
                    title={`Kanji di luar daftar acuan N4/JFT: ${outsideWhitelistKanji.join('、')}`}
                    className="absolute top-3.5 left-3.5 z-10 pointer-events-none inline-flex items-center px-2.5 py-1 rounded-lg border border-violet-200 dark:border-violet-700/80 bg-violet-50 dark:bg-violet-950/80 text-violet-800 dark:text-violet-200 text-[11px] sm:text-xs font-bold whitespace-nowrap"
                  >
                    Kanji Lanjutan
                  </span>
                ) : null}
                <div
                  role="button"
                  tabIndex={flipped ? -1 : 0}
                  id="flashcardFlipFront"
                  aria-pressed={flipped}
                  aria-label={`Kartu kanji ${currentItem?.k ?? ''}, ketuk untuk membalik`}
                  onPointerDown={handleCardPointerDown}
                  onClick={handleCardClick}
                  onKeyDown={handleCardKeyDown}
                  className="w-full h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl cursor-pointer select-text focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <span
                    className={`font-jp font-extrabold text-slate-900 dark:text-slate-50 tracking-tight leading-tight max-w-full break-words cursor-text ${
                      kLen >= 6
                        ? 'text-3xl sm:text-5xl'
                        : kLen >= 4
                          ? 'text-4xl sm:text-6xl'
                          : 'text-6xl sm:text-8xl'
                    }`}
                  >
                    {currentItem?.k}
                  </span>
                  <span className="mt-5 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 select-none">
                    Ketuk kartu atau tekan Spasi untuk membalik
                  </span>
                </div>
                <button
                  type="button"
                  id="btnSpeakFront"
                  onClick={() => {
                    if (currentItem) speakJP(currentItem.r);
                  }}
                  title="Dengarkan pelafalan (A)"
                  className="absolute top-3.5 right-3.5 z-10 min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                  <span>Suara</span>
                </button>
              </div>

              {/* Back Face */}
              <div
                className={`backface-hidden rotate-y-180 absolute inset-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${
                  flipped ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
              >
                {isAdvancedKanji ? (
                  <span
                    title={`Kanji di luar daftar acuan N4/JFT: ${outsideWhitelistKanji.join('、')}`}
                    className="absolute top-3.5 left-3.5 z-10 pointer-events-none inline-flex items-center px-2.5 py-1 rounded-lg border border-violet-200 dark:border-violet-700/80 bg-violet-50 dark:bg-violet-950/80 text-violet-800 dark:text-violet-200 text-[11px] sm:text-xs font-bold whitespace-nowrap"
                  >
                    Kanji Lanjutan
                  </span>
                ) : null}
                <div
                  role="button"
                  tabIndex={flipped ? 0 : -1}
                  id="flashcardFlipBack"
                  aria-pressed={flipped}
                  aria-label={`Sisi belakang kartu ${currentItem?.k ?? ''}, ketuk untuk membalik kembali`}
                  onPointerDown={handleCardPointerDown}
                  onClick={handleCardClick}
                  onKeyDown={handleCardKeyDown}
                  className="w-full h-full flex flex-col items-center justify-center p-5 sm:p-8 text-center overflow-y-auto rounded-2xl cursor-pointer select-text focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <span className="font-jp text-2xl sm:text-4xl font-extrabold text-indigo-700 dark:text-indigo-300 cursor-text">
                    {currentItem?.r}
                  </span>
                  {currentItem?.romaji ? (
                    <span className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium cursor-text">
                      {currentItem.romaji}
                    </span>
                  ) : null}
                  {currentItem?.accent ? (
                    <span className="mt-0.5 text-xs font-jp text-slate-500 dark:text-slate-400 font-medium cursor-text">
                      Aksen: {currentItem.accent}
                    </span>
                  ) : null}
                  <span className="mt-1.5 text-base sm:text-xl font-bold text-slate-900 dark:text-slate-50 cursor-text">
                    {currentItem?.m}
                  </span>
                  {currentItem?.kanjiList && currentItem.kanjiList.length > 0 ? (
                    <span className="mt-1 text-xs font-semibold text-teal-700 dark:text-teal-300 font-jp cursor-text">
                      Kanji: {currentItem.kanjiList.join(' ・ ')}
                    </span>
                  ) : null}
                  <span className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {currentItem
                      ? datasetMode === 'irodori' && currentItem.chapter
                        ? `Bab ${currentItem.chapter}${currentItem.subSection ? ` · ${currentItem.subSection}` : ''}`
                        : `${LEVELS[currentItem.dif].label} · N4`
                      : ''}
                    {currentItem && mastered.has(currentItem.id) ? ' · ✓ Hafal' : ''}
                    {currentItem && hardSet.has(currentItem.id) ? ' · ⚠ Sulit' : ''}
                  </span>

                  <span className="mt-4 w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-3.5 sm:p-4 text-left block">
                    <span className="font-jp text-sm sm:text-lg font-medium text-slate-900 dark:text-slate-50 leading-relaxed block pr-20 cursor-text">
                      {currentItem?.ex}
                    </span>
                    <span className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed block cursor-text">
                      {currentItem?.exi}
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  id="btnSpeakBack"
                  onClick={() => {
                    if (currentItem) speakJP(currentItem.r);
                  }}
                  title="Dengarkan pelafalan (A)"
                  className="absolute top-3.5 right-3.5 z-10 min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                  <span>Kata</span>
                </button>

                <button
                  type="button"
                  id="btnSpeakEx"
                  onClick={() => {
                    if (currentItem) speakJP(currentItem.ex);
                  }}
                  className="absolute bottom-4 right-5 z-10 px-2.5 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 hover:bg-indigo-200 dark:hover:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kalimat</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action Deck */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="btnPrev"
                onClick={onPrev}
                disabled={pos <= 0}
                className="min-h-[46px] px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Sebelumnya</span>
              </button>
              <button
                type="button"
                id="btnUlangi"
                onClick={onNext}
                className="min-h-[46px] px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <span>Selanjutnya</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="btnSulit"
                onClick={onMarkHard}
                className="min-h-[48px] px-3 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                <span>Sulit</span>
              </button>
              <button
                type="button"
                id="btnHafal"
                onClick={onMarkMastered}
                className="min-h-[48px] px-3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Hafal</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btnForget"
                onClick={onForgetCurrent}
                disabled={!currentItem || !mastered.has(currentItem.id)}
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <span>Lupa kanji ini</span>
              </button>
              <button
                type="button"
                id="btnResetAll"
                onClick={() => {
                  if (armedResetMastered) {
                    setArmedResetMastered(false);
                    onResetAllLevelMastered();
                  } else {
                    setArmedResetMastered(true);
                  }
                }}
                disabled={levelMasteredCount === 0}
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-400 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{armedResetMastered ? confirmScopeLabel : 'Lupakan hafalan'}</span>
              </button>
              <button
                type="button"
                id="btnUnhard"
                onClick={onUnhardCurrent}
                disabled={!currentItem || !hardSet.has(currentItem.id)}
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Hapus sulit ini</span>
              </button>
              <button
                type="button"
                id="btnClearHard"
                onClick={() => {
                  if (armedClearHard) {
                    setArmedClearHard(false);
                    onClearLevelHard();
                  } else {
                    setArmedClearHard(true);
                  }
                }}
                disabled={levelHardCount === 0}
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-400 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{armedClearHard ? confirmScopeLabel : 'Hapus semua sulit'}</span>
              </button>
            </div>

            <p className="hidden xl:block text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
              Pintasan: Spasi balik · ←/→ navigasi · S sulit · H hafal · A suara
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
