import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FolderInput, Info, Merge, RefreshCw } from 'lucide-react';
import type { BackupParseResult } from '../types/kanji';

export interface PendingRestoreState {
  parsed: BackupParseResult;
  fileName: string;
}

interface RestoreModalProps {
  pending: PendingRestoreState | null;
  currentMasteredCount: number;
  currentHardCount: number;
  mergedMasteredCount: number;
  mergedHardCount: number;
  cleanBackupHardCount: number;
  onConfirm: (mode: 'merge' | 'replace') => void;
  onClose: () => void;
}

export function RestoreModal({
  pending,
  currentMasteredCount,
  currentHardCount,
  mergedMasteredCount,
  mergedHardCount,
  cleanBackupHardCount,
  onConfirm,
  onClose,
}: RestoreModalProps) {
  const modalBoxRef = useRef<HTMLDivElement>(null);
  const mergeBtnRef = useRef<HTMLButtonElement>(null);
  const [confirmEmptyReplace, setConfirmEmptyReplace] = useState(false);

  useEffect(() => {
    setConfirmEmptyReplace(false);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;

    const focusTimer = requestAnimationFrame(() => {
      mergeBtnRef.current?.focus();
    });

    const getFocusables = (): HTMLElement[] => {
      const box = modalBoxRef.current;
      if (!box) return [];
      return Array.from(
        box.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      const focusables = getFocusables();
      if (!focusables.length) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? focusables.indexOf(active) : -1;

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          const prevIdx = idx <= 0 ? focusables.length - 1 : idx - 1;
          focusables[prevIdx]?.focus();
        } else {
          const nextIdx = idx === -1 || idx >= focusables.length - 1 ? 0 : idx + 1;
          focusables[nextIdx]?.focus();
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIdx = idx === -1 || idx >= focusables.length - 1 ? 0 : idx + 1;
        focusables[nextIdx]?.focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIdx = idx <= 0 ? focusables.length - 1 : idx - 1;
        focusables[prevIdx]?.focus();
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const box = modalBoxRef.current;
      if (!box) return;
      if (!box.contains(e.target as Node)) {
        e.stopPropagation();
        const focusables = getFocusables();
        focusables[0]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn, true);

    return () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [pending, onClose]);

  if (!pending) return null;

  const { parsed, fileName } = pending;
  const { impMastered, rejectedIds, exportedAt, formatType, isEmptyBackup } = parsed;
  const hasCurrentProgress = currentMasteredCount > 0 || currentHardCount > 0;

  const dateLabel =
    exportedAt.length >= 10
      ? `Backup ${exportedAt.slice(0, 10)}`
      : formatType !== 'v1'
        ? 'Format backup versi lama'
        : fileName;

  const handleReplaceClick = () => {
    if (isEmptyBackup && hasCurrentProgress && !confirmEmptyReplace) {
      setConfirmEmptyReplace(true);
      return;
    }
    onConfirm('replace');
  };

  return (
    <div
      id="restoreModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restoreModalTitle"
      aria-describedby="restoreModalDesc"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        ref={modalBoxRef}
        className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 text-slate-900"
      >
        <div className="flex items-center gap-2.5">
          <FolderInput className="w-5 h-5 text-indigo-600 shrink-0" aria-hidden="true" />
          <h2 id="restoreModalTitle" className="text-lg font-bold tracking-tight">
            Pulihkan Data Progres
          </h2>
        </div>
        <p id="restoreModalDesc" className="mt-1.5 text-sm text-slate-600 leading-relaxed">
          Pilih cara memulihkan data dari file backup agar progres belajar yang sudah ada tidak
          hilang tanpa sengaja.
        </p>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Progres Saat Ini</div>
            <div className="mt-1 text-sm font-bold text-slate-900 font-mono-num">
              {currentMasteredCount} hafal · {currentHardCount} sulit
            </div>
            <div className="mt-0.5 text-xs text-slate-500">Tersimpan di browser</div>
          </div>

          <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 p-3">
            <div className="text-xs font-semibold text-indigo-700">File Backup</div>
            <div className="mt-1 text-sm font-bold text-slate-900 font-mono-num">
              {impMastered.length} hafal · {cleanBackupHardCount} sulit
            </div>
            <div className="mt-0.5 text-xs text-indigo-700/80 truncate" title={dateLabel}>
              {dateLabel}
            </div>
          </div>
        </div>

        {isEmptyBackup ? (
          <div
            id="rcEmptyWarn"
            role="alert"
            className={`mt-3 rounded-xl border p-3 text-xs leading-relaxed font-medium flex items-start gap-2 ${
              hasCurrentProgress
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-sky-50 border-sky-200 text-sky-900'
            }`}
          >
            {hasCurrentProgress ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" aria-hidden="true" />
            )}
            <span>
              {hasCurrentProgress
                ? `Peringatan Backup Kosong: File ini berisi 0 kanji hafal dan 0 kanji sulit. Jika memilih "Timpa Semua", seluruh progres saat ini (${currentMasteredCount} hafal, ${currentHardCount} sulit) akan terhapus menjadi 0.`
                : 'File backup ini kosong (0 kanji hafal dan 0 kanji sulit). Tidak ada data progres baru yang akan ditambahkan.'}
            </span>
          </div>
        ) : null}

        {rejectedIds.length > 0 ? (
          <div
            id="rcRejectedWarn"
            role="status"
            className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed font-medium text-amber-900 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
            <span>
              {rejectedIds.length} ID data tidak dikenali dan akan diabaikan:{' '}
              {rejectedIds.slice(0, 5).join(', ')}
              {rejectedIds.length > 5 ? ` (+${rejectedIds.length - 5} lainnya)` : ''}.
            </span>
          </div>
        ) : null}

        {confirmEmptyReplace ? (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950"
          >
            <p className="font-bold">Konfirmasi Timpa Progres</p>
            <p className="mt-1 leading-relaxed">
              Anda yakin ingin menimpa {currentMasteredCount} hafal &amp; {currentHardCount} sulit
              dengan backup kosong (menjadi 0)? Klik tombol &ldquo;Konfirmasi Hapus &amp; Timpa&rdquo;
              di bawah untuk melanjutkan.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5 mt-5">
          <button
            ref={mergeBtnRef}
            type="button"
            id="btnRestoreMerge"
            onClick={() => onConfirm('merge')}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 text-sm font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Merge className="w-4 h-4 shrink-0" aria-hidden="true" />
                Gabungkan (Merge)
              </span>
              <span className="text-xs font-medium text-emerald-100 font-mono-num whitespace-nowrap">
                → {mergedMasteredCount} hafal · {mergedHardCount} sulit
              </span>
            </div>
            <p className="mt-1 text-xs text-emerald-50/90 leading-snug">
              Simpan progres saat ini dan tambahkan data dari file backup (aman).
            </p>
          </button>

          <button
            type="button"
            id="btnRestoreReplace"
            onClick={handleReplaceClick}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 cursor-pointer ${
              confirmEmptyReplace
                ? 'bg-rose-600 border-rose-700 text-white hover:bg-rose-700'
                : 'bg-white border-rose-200 text-slate-900 hover:bg-rose-50 hover:border-rose-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-sm font-bold">
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
                {confirmEmptyReplace ? 'Konfirmasi Hapus & Timpa Semua' : 'Timpa Semua (Replace)'}
              </span>
              <span
                className={`text-xs font-semibold font-mono-num whitespace-nowrap ${
                  confirmEmptyReplace ? 'text-rose-100' : 'text-rose-700'
                }`}
              >
                → {impMastered.length} hafal · {cleanBackupHardCount} sulit
              </span>
            </div>
            <p
              className={`mt-1 text-xs leading-snug ${
                confirmEmptyReplace ? 'text-rose-50' : 'text-slate-600'
              }`}
            >
              Hapus progres saat ini dan ganti seluruhnya dengan isi file backup.
            </p>
          </button>

          <button
            type="button"
            id="btnRestoreCancel"
            onClick={onClose}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 cursor-pointer"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
