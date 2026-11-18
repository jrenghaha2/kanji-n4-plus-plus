import { useState, type RefObject } from 'react';
import type { User } from 'firebase/auth';
import { Cloud, Download, FolderOpen, LogOut } from 'lucide-react';

interface AppHeaderProps {
  masteredCount: number;
  totalCount: number;
  restoreBtnRef: RefObject<HTMLButtonElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  user: User | null;
  authReady: boolean;
  authBusy: boolean;
  syncing: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onTriggerImport: () => void;
  onFileSelected: (file: File) => void;
}

function GoogleGlyph() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function AppHeader({
  masteredCount,
  totalCount,
  restoreBtnRef,
  fileInputRef,
  user,
  authReady,
  authBusy,
  syncing,
  onSignIn,
  onSignOut,
  onExport,
  onTriggerImport,
  onFileSelected,
}: AppHeaderProps) {
  const [avatarBroken, setAvatarBroken] = useState(false);

  const displayName = user?.displayName?.trim() || user?.email?.split('@')[0] || 'Akun Google';
  const initial = displayName.charAt(0).toUpperCase() || 'G';

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-600 text-white font-jp font-bold text-base sm:text-lg shrink-0"
          >
            日
          </span>
          <span className="font-bold text-sm sm:text-lg tracking-tight text-slate-900 whitespace-nowrap">
            N4 Kanji
          </span>
        </div>

        <div className="text-xs sm:text-sm font-medium text-slate-600 font-mono-num whitespace-nowrap shrink-0">
          <strong className="text-emerald-700 font-bold" id="mCount">
            {masteredCount}
          </strong>
          /<span id="mTotal">{totalCount}</span>
          <span className="hidden xs:inline sm:inline"> hafal</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            id="btnExportData"
            onClick={onExport}
            aria-label="Backup progres (.json)"
            className="min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
            title="Backup progres (.json)"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">Backup</span>
          </button>

          <button
            ref={restoreBtnRef}
            type="button"
            id="btnImportData"
            onClick={onTriggerImport}
            aria-label="Restore progres (.json)"
            className="min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600"
            title="Restore progres (.json)"
          >
            <FolderOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">Restore</span>
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

          {!authReady ? (
            <div
              aria-hidden="true"
              className="h-10 w-[86px] sm:w-[120px] rounded-xl bg-slate-100 animate-pulse shrink-0"
            />
          ) : user ? (
            <div className="flex items-center gap-1.5 sm:gap-2 pl-1 sm:pl-2 border-l border-slate-200 shrink-0">
              <div
                className="flex items-center gap-2 min-w-0"
                title={`${displayName}${user.email ? ` (${user.email})` : ''}`}
              >
                {user.photoURL && !avatarBroken ? (
                  <img
                    src={user.photoURL}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarBroken(true)}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 object-cover shrink-0"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold text-xs inline-flex items-center justify-center shrink-0"
                  >
                    {initial}
                  </span>
                )}
                <span className="hidden lg:inline text-xs font-semibold text-slate-700 max-w-[120px] truncate">
                  {displayName}
                </span>
                {syncing ? (
                  <Cloud
                    className="w-3.5 h-3.5 text-indigo-600 animate-pulse shrink-0"
                    aria-label="Menyinkronkan progres"
                  />
                ) : null}
              </div>

              <button
                type="button"
                id="btnGoogleLogout"
                onClick={onSignOut}
                disabled={authBusy}
                aria-label="Keluar dari akun Google"
                title="Keluar dari akun Google"
                className="min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-700 hover:text-rose-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="btnGoogleLogin"
              onClick={onSignIn}
              disabled={authBusy}
              aria-label="Masuk dengan Google untuk sinkronisasi progres"
              title="Masuk dengan Google"
              className="min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-slate-800 hover:text-indigo-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <GoogleGlyph />
              <span>{authBusy ? 'Masuk...' : 'Masuk'}</span>
              <span className="hidden sm:inline">{authBusy ? '' : 'Google'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
