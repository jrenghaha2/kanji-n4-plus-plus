import type { RefObject } from 'react';
import { Download, FolderOpen } from 'lucide-react';

interface AppHeaderProps {
  masteredCount: number;
  totalCount: number;
  restoreBtnRef: RefObject<HTMLButtonElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onTriggerImport: () => void;
  onFileSelected: (file: File) => void;
}

export function AppHeader({
  masteredCount,
  totalCount,
  restoreBtnRef,
  fileInputRef,
  onExport,
  onTriggerImport,
  onFileSelected,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 text-white font-jp font-bold text-lg shrink-0"
          >
            日
          </span>
          <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 whitespace-nowrap">
            N4 Kanji
          </span>
        </div>

        <div className="text-xs sm:text-sm font-medium text-slate-600 font-mono-num whitespace-nowrap">
          <strong className="text-emerald-700 font-bold" id="mCount">
            {masteredCount}
          </strong>
          /<span id="mTotal">{totalCount}</span> hafal
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            id="btnExportData"
            onClick={onExport}
            aria-label="Backup progres (.json)"
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
            title="Backup progres (.json)"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Backup</span>
          </button>

          <button
            ref={restoreBtnRef}
            type="button"
            id="btnImportData"
            onClick={onTriggerImport}
            aria-label="Restore progres (.json)"
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
            title="Restore progres (.json)"
          >
            <FolderOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Restore</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            id="fileImportData"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Pilih file backup JSON"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
            }}
          />
        </div>
      </div>
    </header>
  );
}
