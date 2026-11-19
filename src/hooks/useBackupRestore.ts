import { useCallback, useMemo, useRef, useState } from 'react';
import type { PendingRestoreState } from '../components/RestoreModal';
import type { AppDatasetMode, IrodoriBookId } from '../types/kanji';
import { buildBackupPayload, validateAndParseBackup } from '../utils/storage';
import type { ShowToastFn } from './useToast';

interface UseBackupRestoreOptions {
  datasetMode: AppDatasetMode;
  irodoriBookId: IrodoriBookId;
  activeMastered: Set<string>;
  activeHardSet: Set<string>;
  activeValidIds: Set<string>;
  applyProgressChange: (nextMastered: Set<string>, nextHard: Set<string>) => boolean;
  onRestoreCommitted: (nextMastered: Set<string>, nextHard: Set<string>) => void;
  showToast: ShowToastFn;
  dismissToast: () => void;
}

export function useBackupRestore({
  datasetMode,
  irodoriBookId,
  activeMastered,
  activeHardSet,
  activeValidIds,
  applyProgressChange,
  onRestoreCommitted,
  showToast,
  dismissToast,
}: UseBackupRestoreOptions) {
  const [pendingRestore, setPendingRestore] = useState<PendingRestoreState | null>(null);
  const restoreBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const restoreFocusToButton = useCallback(() => {
    requestAnimationFrame(() => {
      restoreBtnRef.current?.focus();
    });
  }, []);

  const clearPendingRestore = useCallback(() => {
    setPendingRestore(null);
  }, []);

  const handleExport = useCallback(() => {
    try {
      const payload = buildBackupPayload(activeMastered, activeHardSet);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const prefix =
        datasetMode === 'irodori' ? `backup-irodori-${irodoriBookId}` : 'backup-kanji-n4';
      a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(
        'success',
        'Backup Diunduh',
        `${activeMastered.size} hafal & ${activeHardSet.size} sulit diekspor ke JSON.`
      );
    } catch {
      showToast('error', 'Backup Gagal', 'Gagal membuat file backup JSON.');
    }
  }, [activeMastered, activeHardSet, datasetMode, irodoriBookId, showToast]);

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
          const parsed = validateAndParseBackup(text, activeValidIds);
          dismissToast();
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
    [showToast, dismissToast, restoreFocusToButton, activeValidIds]
  );

  const restorePreviews = useMemo(() => {
    if (!pendingRestore) {
      return { mergedMastered: 0, mergedHard: 0, cleanImpHard: 0 };
    }
    const { impMastered, impHard } = pendingRestore.parsed;
    const mergedM = new Set([...activeMastered, ...impMastered]);
    const mergedH = new Set([...activeHardSet, ...impHard].filter(id => !mergedM.has(id)));
    const cleanImpH = impHard.filter(id => !impMastered.includes(id));
    return {
      mergedMastered: mergedM.size,
      mergedHard: mergedH.size,
      cleanImpHard: cleanImpH.length,
    };
  }, [pendingRestore, activeMastered, activeHardSet]);

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
        nextMastered = new Set(activeMastered);
        nextHard = new Set(activeHardSet);
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

      onRestoreCommitted(nextMastered, nextHard);

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
      activeMastered,
      activeHardSet,
      applyProgressChange,
      restoreFocusToButton,
      onRestoreCommitted,
      showToast,
    ]
  );

  return {
    pendingRestore,
    clearPendingRestore,
    restoreBtnRef,
    fileInputRef,
    restorePreviews,
    handleExport,
    handleTriggerImport,
    handleFileSelected,
    handleCloseRestoreModal,
    handleConfirmRestore,
  };
}
