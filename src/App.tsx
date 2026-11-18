import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { FlashcardPanel } from './components/FlashcardPanel';
import { KanjiListPanel } from './components/KanjiListPanel';
import { QuizPanel } from './components/QuizPanel';
import { RestoreModal, type PendingRestoreState } from './components/RestoreModal';
import { Sidebar } from './components/Sidebar';
import { ToastBanner } from './components/ToastBanner';
import { KANJI } from './data/kanjiData';
import type { AppTab, LevelFilter, ToastMessage } from './types/kanji';
import { getPoolIndices, shuffled } from './utils/quizEngine';
import {
  HARD_KEY,
  LS_KEY,
  buildBackupPayload,
  commitProgressTransaction,
  safeLoadSet,
  validateAndParseBackup,
} from './utils/storage';
import { speakJP } from './utils/tts';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('card');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');

  const [mastered, setMastered] = useState<Set<string>>(() => safeLoadSet(LS_KEY));
  const [hardSet, setHardSet] = useState<Set<string>>(() => safeLoadSet(HARD_KEY));

  const [hardMode, setHardMode] = useState(false);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [hideMastered, setHideMastered] = useState(false);

  const [order, setOrder] = useState<number[]>(() => getPoolIndices('all', KANJI));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionHard, setSessionHard] = useState<Set<number>>(() => new Set());
  const [sessionNewMaster, setSessionNewMaster] = useState(0);

  const [pendingRestore, setPendingRestore] = useState<PendingRestoreState | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const restoreBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastCounterRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (tone: ToastMessage['tone'], title: string, detail?: string) => {
      toastCounterRef.current += 1;
      const id = toastCounterRef.current;
      setToast({ id, tone, title, detail });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToast(prev => (prev?.id === id ? null : prev));
      }, 6500);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const computeCardPool = useCallback(
    (
      lv: LevelFilter,
      hideM: boolean,
      onlyH: boolean,
      mSet: Set<string>,
      hSet: Set<string>
    ) => {
      return getPoolIndices(lv, KANJI).filter(
        i => (!hideM || !mSet.has(KANJI[i].id)) && (!onlyH || hSet.has(KANJI[i].id))
      );
    },
    []
  );

  const rebuildOrder = useCallback((indices: number[], shouldShuffle: boolean) => {
    setOrder(shouldShuffle ? shuffled(indices) : indices.slice());
    setPos(0);
    setFlipped(false);
    setSessionHard(new Set());
    setSessionNewMaster(0);
  }, []);

  const levelIndices = useMemo(() => getPoolIndices(levelFilter, KANJI), [levelFilter]);
  const levelMasteredCount = useMemo(
    () => levelIndices.filter(i => mastered.has(KANJI[i].id)).length,
    [levelIndices, mastered]
  );
  const levelHardCount = useMemo(
    () => levelIndices.filter(i => hardSet.has(KANJI[i].id)).length,
    [levelIndices, hardSet]
  );

  const applyProgressChange = useCallback(
    (nextMastered: Set<string>, nextHard: Set<string>): boolean => {
      const tx = commitProgressTransaction(nextMastered, nextHard);
      if (!tx.ok) {
        showToast('error', 'Penyimpanan Gagal', tx.error);
        return false;
      }
      setMastered(nextMastered);
      setHardSet(nextHard);
      return true;
    },
    [showToast]
  );

  const handleSelectLevel = useCallback(
    (nextLevel: LevelFilter) => {
      if (nextLevel === levelFilter) return;
      setLevelFilter(nextLevel);
      const nextPool = computeCardPool(nextLevel, hideMastered, hardMode, mastered, hardSet);
      rebuildOrder(nextPool, shuffleOn);
    },
    [levelFilter, computeCardPool, hideMastered, hardMode, mastered, hardSet, rebuildOrder, shuffleOn]
  );

  const handleMarkMastered = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    const nextM = new Set(mastered);
    const nextH = new Set(hardSet);
    const isNew = !nextM.has(item.id);
    nextM.add(item.id);
    nextH.delete(item.id);

    if (!applyProgressChange(nextM, nextH)) return;
    if (isNew) setSessionNewMaster(v => v + 1);
    setPos(p => p + 1);
    setFlipped(false);
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleMarkHard = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    const nextM = new Set(mastered);
    const nextH = new Set(hardSet);
    nextH.add(item.id);

    if (!applyProgressChange(nextM, nextH)) return;
    setSessionHard(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setPos(p => p + 1);
    setFlipped(false);
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleForgetCurrent = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    if (!mastered.has(item.id)) return;
    const nextM = new Set(mastered);
    nextM.delete(item.id);
    applyProgressChange(nextM, new Set(hardSet));
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleResetAllLevelMastered = useCallback(() => {
    const nextM = new Set(mastered);
    levelIndices.forEach(i => nextM.delete(KANJI[i].id));
    if (applyProgressChange(nextM, new Set(hardSet))) {
      showToast('info', 'Hafalan Direset', `Data hafalan untuk level ${levelFilter} telah dihapus.`);
    }
  }, [mastered, hardSet, levelIndices, applyProgressChange, showToast, levelFilter]);

  const handleUnhardCurrent = useCallback(() => {
    const idx = order[pos];
    if (idx === undefined) return;
    const item = KANJI[idx];
    if (!hardSet.has(item.id)) return;
    const nextH = new Set(hardSet);
    nextH.delete(item.id);
    if (!applyProgressChange(new Set(mastered), nextH)) return;
    setSessionHard(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }, [order, pos, mastered, hardSet, applyProgressChange]);

  const handleClearLevelHard = useCallback(() => {
    const nextH = new Set(hardSet);
    levelIndices.forEach(i => nextH.delete(KANJI[i].id));
    if (applyProgressChange(new Set(mastered), nextH)) {
      setSessionHard(new Set());
      showToast('info', 'Daftar Sulit Dihapus', `Daftar sulit untuk level ${levelFilter} telah dikosongkan.`);
    }
  }, [hardSet, mastered, levelIndices, applyProgressChange, showToast, levelFilter]);

  const handleToggleHideMastered = useCallback(() => {
    const nextHide = !hideMastered;
    setHideMastered(nextHide);
    const nextPool = computeCardPool(levelFilter, nextHide, hardMode, mastered, hardSet);
    rebuildOrder(nextPool, shuffleOn);
  }, [hideMastered, computeCardPool, levelFilter, hardMode, mastered, hardSet, rebuildOrder, shuffleOn]);

  const handleToggleShuffle = useCallback(() => {
    const nextShuffle = !shuffleOn;
    setShuffleOn(nextShuffle);
    const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, mastered, hardSet);
    rebuildOrder(nextPool, nextShuffle);
  }, [shuffleOn, computeCardPool, levelFilter, hideMastered, hardMode, mastered, hardSet, rebuildOrder]);

  const handleToggleHardMode = useCallback(() => {
    const nextHardMode = !hardMode;
    setHardMode(nextHardMode);
    const nextPool = computeCardPool(levelFilter, hideMastered, nextHardMode, mastered, hardSet);
    rebuildOrder(nextPool, shuffleOn);
  }, [hardMode, computeCardPool, levelFilter, hideMastered, mastered, hardSet, rebuildOrder, shuffleOn]);

  const handleRestartSession = useCallback(() => {
    const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, mastered, hardSet);
    rebuildOrder(nextPool, shuffleOn);
  }, [computeCardPool, levelFilter, hideMastered, hardMode, mastered, hardSet, rebuildOrder, shuffleOn]);

  const handleRepeatSessionHard = useCallback(() => {
    rebuildOrder([...sessionHard], shuffleOn);
  }, [sessionHard, rebuildOrder, shuffleOn]);

  // Global keyboard shortcuts for Flashcard mode (disabled when RestoreModal is open)
  useEffect(() => {
    if (activeTab !== 'card' || pendingRestore !== null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (pos >= order.length) return;

      if (e.key === ' ') {
        if (target?.closest('#flashcard') || target?.tagName === 'BUTTON') return;
        e.preventDefault();
        setFlipped(f => !f);
      } else if (e.key === 'ArrowLeft') {
        if (pos > 0) {
          e.preventDefault();
          setPos(p => p - 1);
          setFlipped(false);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPos(p => p + 1);
        setFlipped(false);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        handleMarkMastered();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleMarkHard();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const item = KANJI[order[pos]];
        if (item) speakJP(item.r);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeTab, pendingRestore, pos, order, handleMarkMastered, handleMarkHard]);

  const handleExport = useCallback(() => {
    try {
      const payload = buildBackupPayload(mastered, hardSet);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-kanji-n4-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(
        'success',
        'Backup Diunduh',
        `${mastered.size} hafal & ${hardSet.size} sulit diekspor ke JSON.`
      );
    } catch {
      showToast('error', 'Backup Gagal', 'Gagal membuat file backup JSON.');
    }
  }, [mastered, hardSet, showToast]);

  const restoreFocusToButton = useCallback(() => {
    requestAnimationFrame(() => {
      restoreBtnRef.current?.focus();
    });
  }, []);

  const handleTriggerImport = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const handleFileSelected = useCallback(
    (file: File) => {
      if (file.size > 1024 * 1024) {
        showToast('error', 'Restore Ditolak', 'Ukuran file terlalu besar (maksimal 1 MB).');
        restoreFocusToButton();
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        showToast(
          'error',
          'Gagal Membaca File',
          'File tidak dapat dibaca. Progres saat ini tetap aman.'
        );
        restoreFocusToButton();
      };
      reader.onabort = () => {
        showToast('warning', 'Restore Dibatalkan', 'Pembacaan file dihentikan.');
        restoreFocusToButton();
      };
      reader.onload = ev => {
        try {
          const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
          const parsed = validateAndParseBackup(text);
          setToast(null);
          setPendingRestore({ parsed, fileName: file.name });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'File backup tidak valid atau rusak.';
          showToast(
            'error',
            'Restore Ditolak',
            `${msg} Progres saat ini tetap aman dan tidak berubah.`
          );
          restoreFocusToButton();
        }
      };
      reader.readAsText(file);
    },
    [showToast, restoreFocusToButton]
  );

  const restorePreviews = useMemo(() => {
    if (!pendingRestore) {
      return { mergedMastered: 0, mergedHard: 0, cleanImpHard: 0 };
    }
    const { impMastered, impHard } = pendingRestore.parsed;
    const mergedM = new Set([...mastered, ...impMastered]);
    const mergedH = new Set([...hardSet, ...impHard].filter(id => !mergedM.has(id)));
    const cleanImpH = impHard.filter(id => !impMastered.includes(id));
    return {
      mergedMastered: mergedM.size,
      mergedHard: mergedH.size,
      cleanImpHard: cleanImpH.length,
    };
  }, [pendingRestore, mastered, hardSet]);

  const handleCloseRestoreModal = useCallback(() => {
    setPendingRestore(null);
    restoreFocusToButton();
  }, [restoreFocusToButton]);

  const handleConfirmRestore = useCallback(
    (mode: 'merge' | 'replace') => {
      if (!pendingRestore) return;
      const { impMastered, impHard, rejectedIds } = pendingRestore.parsed;

      let nextMastered: Set<string>;
      let nextHard: Set<string>;

      if (mode === 'merge') {
        nextMastered = new Set(mastered);
        nextHard = new Set(hardSet);
        impMastered.forEach(id => {
          nextMastered.add(id);
          nextHard.delete(id);
        });
        impHard.forEach(id => {
          if (!nextMastered.has(id)) nextHard.add(id);
        });
      } else {
        nextMastered = new Set(impMastered);
        nextHard = new Set(impHard.filter(id => !nextMastered.has(id)));
      }

      const committed = applyProgressChange(nextMastered, nextHard);
      setPendingRestore(null);
      restoreFocusToButton();
      if (!committed) return;

      const nextPool = computeCardPool(levelFilter, hideMastered, hardMode, nextMastered, nextHard);
      rebuildOrder(nextPool, shuffleOn);

      const modeLabel = mode === 'merge' ? 'digabungkan' : 'ditimpa';
      const rejectedNote = rejectedIds.length
        ? `${rejectedIds.length} ID tidak dikenali diabaikan.`
        : undefined;

      showToast(
        'success',
        `Progres berhasil ${modeLabel}: ${nextMastered.size} hafal & ${nextHard.size} sulit.`,
        rejectedNote
      );
    },
    [
      pendingRestore,
      mastered,
      hardSet,
      applyProgressChange,
      restoreFocusToButton,
      computeCardPool,
      levelFilter,
      hideMastered,
      hardMode,
      rebuildOrder,
      shuffleOn,
      showToast,
    ]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <div
        aria-hidden={pendingRestore !== null}
        className="flex-1 flex flex-col"
      >
        <AppHeader
          masteredCount={levelMasteredCount}
          totalCount={levelIndices.length}
          restoreBtnRef={restoreBtnRef}
          fileInputRef={fileInputRef}
          onExport={handleExport}
          onTriggerImport={handleTriggerImport}
          onFileSelected={handleFileSelected}
        />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
            <Sidebar
              activeTab={activeTab}
              levelFilter={levelFilter}
              onSelectTab={setActiveTab}
              onSelectLevel={handleSelectLevel}
            />

            <div className="min-w-0">
              {activeTab === 'card' ? (
                <FlashcardPanel
                  levelFilter={levelFilter}
                  order={order}
                  pos={pos}
                  flipped={flipped}
                  hideMastered={hideMastered}
                  shuffleOn={shuffleOn}
                  hardMode={hardMode}
                  mastered={mastered}
                  hardSet={hardSet}
                  levelHardCount={levelHardCount}
                  levelMasteredCount={levelMasteredCount}
                  sessionHardCount={sessionHard.size}
                  sessionNewMaster={sessionNewMaster}
                  onFlip={() => setFlipped(f => !f)}
                  onPrev={() => {
                    if (pos > 0) {
                      setPos(p => p - 1);
                      setFlipped(false);
                    }
                  }}
                  onNext={() => {
                    setPos(p => p + 1);
                    setFlipped(false);
                  }}
                  onMarkMastered={handleMarkMastered}
                  onMarkHard={handleMarkHard}
                  onForgetCurrent={handleForgetCurrent}
                  onResetAllLevelMastered={handleResetAllLevelMastered}
                  onUnhardCurrent={handleUnhardCurrent}
                  onClearLevelHard={handleClearLevelHard}
                  onToggleHideMastered={handleToggleHideMastered}
                  onToggleShuffle={handleToggleShuffle}
                  onToggleHardMode={handleToggleHardMode}
                  onRestartSession={handleRestartSession}
                  onRepeatSessionHard={handleRepeatSessionHard}
                />
              ) : null}

              {activeTab === 'list' ? (
                <KanjiListPanel
                  levelFilter={levelFilter}
                  mastered={mastered}
                  hardSet={hardSet}
                />
              ) : null}

              {activeTab === 'quiz' ? (
                <QuizPanel
                  levelFilter={levelFilter}
                  modalOpen={pendingRestore !== null}
                />
              ) : null}
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-200 bg-white/70 py-5 px-4 text-center text-xs text-slate-500">
          500 kosakata kanji JLPT N4 · hingga 2.500 variasi soal kuis · progres tersimpan di perangkat ini
        </footer>
      </div>

      <RestoreModal
        pending={pendingRestore}
        currentMasteredCount={mastered.size}
        currentHardCount={hardSet.size}
        mergedMasteredCount={restorePreviews.mergedMastered}
        mergedHardCount={restorePreviews.mergedHard}
        cleanBackupHardCount={restorePreviews.cleanImpHard}
        onConfirm={handleConfirmRestore}
        onClose={handleCloseRestoreModal}
      />

      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
