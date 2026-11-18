import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  EyeOff,
  RotateCcw,
  Shuffle,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { KANJI, LEVELS } from '../data/kanjiData';
import type { AppDatasetMode, KanjiEntry, LevelFilter } from '../types/kanji';
import { speakJP } from '../utils/tts';

interface FlashcardPanelProps {
  datasetMode?: AppDatasetMode;
  dataset?: readonly KanjiEntry[];
  scopeLabel?: string;
  levelFilter: LevelFilter;
  order: number[];
  pos: number;
  flipped: boolean;
  hideMastered: boolean;
  shuffleOn: boolean;
  hardMode: boolean;
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
  onToggleHideMastered: () => void;
  onToggleShuffle: () => void;
  onToggleHardMode: () => void;
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
  hideMastered,
  shuffleOn,
  hardMode,
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
  onToggleHideMastered,
  onToggleShuffle,
  onToggleHardMode,
  onRestartSession,
  onRepeatSessionHard,
}: FlashcardPanelProps) {
  const [armedResetMastered, setArmedResetMastered] = useState(false);
  const [armedClearHard, setArmedClearHard] = useState(false);

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

  const confirmScopeLabel =
    datasetMode === 'irodori'
      ? `Yakin? (${levelLabel}) ketuk lagi`
      : levelFilter === 'all'
        ? 'Yakin? Ketuk lagi'
        : `Yakin? (level ${levelLabel}) ketuk lagi`;

  return (
    <section aria-label="Mode Kartu Flashcard" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-600 font-mono-num" id="cardCounter">
          {isDone ? `Selesai · ${total} kartu` : `Kartu ${pos + 1} dari ${total}`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="btnHideMastered"
            onClick={onToggleHideMastered}
            className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 ${
              hideMastered
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Sembunyikan hafal: {hideMastered ? 'nyala' : 'mati'}</span>
          </button>

          <button
            type="button"
            id="btnShuffle"
            onClick={onToggleShuffle}
            className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 ${
              shuffleOn
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Shuffle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Acak: {shuffleOn ? 'nyala' : 'mati'}</span>
          </button>
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-indigo-600 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {isDone ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
          <div className="text-4xl" aria-hidden="true">
            🎉
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-900">Sesi selesai!</h2>
          <p className="mt-2 text-sm text-slate-600 font-medium">
            {total === 0
              ? hardMode
                ? datasetMode === 'irodori'
                  ? 'Belum ada kosakata sulit di pilihan ini.'
                  : 'Belum ada kanji sulit di level ini.'
                : datasetMode === 'irodori'
                  ? 'Semua kosakata di pilihan ini sudah hafal.'
                  : 'Semua kanji di level ini sudah hafal.'
              : `${total} kartu diulas · ${sessionNewMaster} hafal baru · ${sessionHardCount} ditandai sulit`}
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            {sessionHardCount > 0 ? (
              <button
                type="button"
                onClick={onRepeatSessionHard}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>Ulangi kartu sulit ({sessionHardCount})</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRestartSession}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              Mulai sesi baru
            </button>
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
              <div className="backface-hidden absolute inset-0 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <button
                  type="button"
                  id="flashcardFlipFront"
                  aria-pressed={flipped}
                  aria-label={`Kartu kanji ${currentItem?.k ?? ''}, ketuk untuk membalik`}
                  onClick={onFlip}
                  className="w-full h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
                >
                  <span
                    className={`font-jp font-extrabold text-slate-900 tracking-tight leading-tight max-w-full break-words ${
                      kLen >= 6
                        ? 'text-3xl sm:text-5xl'
                        : kLen >= 4
                          ? 'text-4xl sm:text-6xl'
                          : 'text-6xl sm:text-8xl'
                    }`}
                  >
                    {currentItem?.k}
                  </span>
                  <span className="mt-5 text-xs sm:text-sm font-medium text-slate-500">
                    Ketuk kartu atau tekan Spasi untuk membalik
                  </span>
                </button>
                <button
                  type="button"
                  id="btnSpeakFront"
                  onClick={() => {
                    if (currentItem) speakJP(currentItem.r);
                  }}
                  title="Dengarkan pelafalan (A)"
                  className="absolute top-3.5 right-3.5 z-10 min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
                >
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                  <span>Suara</span>
                </button>
              </div>

              {/* Back Face */}
              <div className="backface-hidden rotate-y-180 absolute inset-0 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <button
                  type="button"
                  id="flashcardFlipBack"
                  aria-pressed={flipped}
                  aria-label={`Sisi belakang kartu ${currentItem?.k ?? ''}, ketuk untuk membalik kembali`}
                  onClick={onFlip}
                  className="w-full h-full flex flex-col items-center justify-center p-5 sm:p-8 text-center overflow-y-auto rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
                >
                  <span className="font-jp text-2xl sm:text-4xl font-extrabold text-indigo-700">
                    {currentItem?.r}
                  </span>
                  {currentItem?.accent ? (
                    <span className="mt-0.5 text-xs font-jp text-slate-500 font-medium">
                      Aksen: {currentItem.accent}
                    </span>
                  ) : null}
                  <span className="mt-1.5 text-base sm:text-xl font-bold text-slate-900">
                    {currentItem?.m}
                  </span>
                  <span className="mt-1.5 text-xs font-semibold text-slate-500">
                    {currentItem
                      ? datasetMode === 'irodori' && currentItem.chapter
                        ? `Bab ${currentItem.chapter}${currentItem.subSection ? ` · ${currentItem.subSection}` : ''}`
                        : `${LEVELS[currentItem.dif].label} · N4`
                      : ''}
                    {currentItem && mastered.has(currentItem.id) ? ' · ✓ Hafal' : ''}
                    {currentItem && hardSet.has(currentItem.id) ? ' · ⚠ Sulit' : ''}
                  </span>

                  <span className="mt-4 w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 text-left block">
                    <span className="font-jp text-sm sm:text-lg font-medium text-slate-900 leading-relaxed block pr-20">
                      {currentItem?.ex}
                    </span>
                    <span className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed block">
                      {currentItem?.exi}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  id="btnSpeakBack"
                  onClick={() => {
                    if (currentItem) speakJP(currentItem.r);
                  }}
                  title="Dengarkan pelafalan (A)"
                  className="absolute top-3.5 right-3.5 z-10 min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
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
                  className="absolute bottom-4 right-5 z-10 px-2.5 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-xs font-bold inline-flex items-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
                >
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kalimat</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action Deck */}
          <div className="space-y-3">
            <button
              type="button"
              id="btnHardMode"
              onClick={onToggleHardMode}
              disabled={!hardMode && levelHardCount === 0}
              className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                hardMode
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-white border-dashed border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Kartu sulit ({levelHardCount}){hardMode ? ': nyala' : ''}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="btnPrev"
                onClick={onPrev}
                disabled={pos <= 0}
                className="min-h-[46px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Sebelumnya</span>
              </button>
              <button
                type="button"
                id="btnUlangi"
                onClick={onNext}
                className="min-h-[46px] px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
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
                className="min-h-[48px] px-3 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                <span>Sulit</span>
              </button>
              <button
                type="button"
                id="btnHafal"
                onClick={onMarkMastered}
                className="min-h-[48px] px-3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Hafal</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btnForget"
                onClick={onForgetCurrent}
                disabled={!currentItem || !mastered.has(currentItem.id)}
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
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
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{armedResetMastered ? confirmScopeLabel : 'Lupakan hafalan'}</span>
              </button>
              <button
                type="button"
                id="btnUnhard"
                onClick={onUnhardCurrent}
                disabled={!currentItem || !hardSet.has(currentItem.id)}
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
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
                className="min-h-[42px] px-2.5 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{armedClearHard ? confirmScopeLabel : 'Hapus semua sulit'}</span>
              </button>
            </div>

            <p className="hidden xl:block text-xs text-slate-500 leading-relaxed pt-1">
              Pintasan: Spasi balik · ←/→ navigasi · S sulit · H hafal · A suara
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
