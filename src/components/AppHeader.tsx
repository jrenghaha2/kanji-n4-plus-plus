import { useEffect, useRef, useState, type RefObject } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Camera,
  ChevronDown,
  Cloud,
  Download,
  FolderOpen,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  Users,
} from 'lucide-react';
import type { AppDatasetMode } from '../types/kanji';

interface AppHeaderProps {
  datasetMode: AppDatasetMode;
  irodoriBookTitle?: string;
  onToggleDatasetMode: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  masteredCount: number;
  totalCount: number;
  restoreBtnRef: RefObject<HTMLButtonElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  user: User | null;
  displayName: string;
  avatarUrl: string;
  authReady: boolean;
  authBusy: boolean;
  syncing: boolean;
  onOpenAuthModal: (isSwitch: boolean) => void;
  onOpenProfileModal: () => void;
  onManualSync: () => void;
  onResendVerification: () => void;
  onRefreshVerification: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onTriggerImport: () => void;
  onFileSelected: (file: File) => void;
}

function getProviderLabel(user: User): string {
  const providerId = user.providerData?.[0]?.providerId;
  if (providerId === 'google.com') return 'Google';
  if (providerId === 'github.com') return 'GitHub';
  if (providerId === 'password') return 'Email & Sandi';
  return 'Akun Terhubung';
}

export function AppHeader({
  datasetMode,
  irodoriBookTitle = 'Irodori Dasar 1',
  onToggleDatasetMode,
  isDark,
  onToggleTheme,
  masteredCount,
  totalCount,
  restoreBtnRef,
  fileInputRef,
  user,
  displayName,
  avatarUrl,
  authReady,
  authBusy,
  syncing,
  onOpenAuthModal,
  onOpenProfileModal,
  onManualSync,
  onResendVerification,
  onRefreshVerification,
  onSignOut,
  onExport,
  onTriggerImport,
  onFileSelected,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const menuWrapperRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarUrl, user?.uid]);

  useEffect(() => {
    if (!user) {
      setMenuOpen(false);
    }
  }, [user]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuWrapperRef.current && !menuWrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        requestAnimationFrame(() => menuBtnRef.current?.focus());
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const resolvedName =
    displayName.trim() || user?.displayName?.trim() || user?.email?.split('@')[0] || 'Pengguna';
  const initial = resolvedName.charAt(0).toUpperCase() || 'K';
  const resolvedAvatar = avatarUrl || user?.photoURL || '';
  const isVerified = Boolean(user?.emailVerified);

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2 lg:py-0 lg:h-16 flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-2 gap-y-2 sm:gap-x-3">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0 order-1">
          <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-white font-jp font-bold text-base sm:text-lg shrink-0 ${
              datasetMode === 'irodori' ? 'bg-teal-600' : 'bg-indigo-600'
            }`}
          >
            {datasetMode === 'irodori' ? '彩' : '日'}
          </span>
          <span className="font-bold text-sm sm:text-lg tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
            {datasetMode === 'irodori' ? irodoriBookTitle : 'N4 Kanji'}
          </span>
        </div>

        <div className="w-full lg:w-auto order-4 lg:order-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 lg:border-t-0 lg:pt-0 flex items-center">
          <button
            type="button"
            id="btnToggleIrodori"
            onClick={onToggleDatasetMode}
            aria-pressed={datasetMode === 'irodori'}
            className={`w-full lg:w-auto min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              datasetMode === 'irodori'
                ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 dark:hover:bg-white'
                : 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100 dark:bg-teal-950/70 dark:border-teal-800 dark:text-teal-200 dark:hover:bg-teal-900/70'
            }`}
          >
            {datasetMode === 'irodori' ? (
              <>
                <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Kembali ke Kanji N4</span>
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Buka Kotoba dan Kanji Irodori</span>
              </>
            )}
          </button>
        </div>

        <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 font-mono-num whitespace-nowrap shrink-0 order-2 lg:order-3">
          <strong className="text-emerald-700 dark:text-emerald-400 font-bold" id="mCount">
            {masteredCount}
          </strong>
          /<span id="mTotal">{totalCount}</span>
          <span className="hidden xs:inline sm:inline"> hafal</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 order-3 lg:order-4">
          <button
            type="button"
            id="btnToggleTheme"
            onClick={onToggleTheme}
            aria-pressed={isDark}
            aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            title={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
            className="min-h-[40px] min-w-[40px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            {isDark ? (
              <Sun className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
          </button>

          {authReady && !user ? (
            <>
              <button
                type="button"
                id="btnExportData"
                onClick={onExport}
                aria-label="Backup progres (.json)"
                className="min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
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
                className="min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
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
            </>
          ) : null}

          {!authReady ? (
            <div
              aria-hidden="true"
              className="h-10 w-[86px] sm:w-[104px] rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0"
            />
          ) : user ? (
            <div ref={menuWrapperRef} className="relative">
              <button
                ref={menuBtnRef}
                type="button"
                id="btnAccountMenu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Menu akun ${resolvedName}`}
                onClick={() => setMenuOpen(o => !o)}
                className="min-h-[40px] px-2 sm:px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <span className="relative shrink-0">
                  {resolvedAvatar && !avatarBroken ? (
                    <img
                      src={resolvedAvatar}
                      alt={resolvedName}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarBroken(true)}
                      className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-700 object-cover bg-slate-100 dark:bg-slate-700"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="w-7 h-7 rounded-full border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 font-bold text-xs inline-flex items-center justify-center"
                    >
                      {initial}
                    </span>
                  )}
                  {!isVerified ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white dark:border-slate-800"
                    />
                  ) : syncing ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-800 animate-pulse"
                    />
                  ) : null}
                </span>

                <span className="hidden md:inline text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 max-w-[130px] truncate">
                  {resolvedName}
                </span>

                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform shrink-0 ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {menuOpen ? (
                <div
                  id="accountMenuDropdown"
                  role="menu"
                  aria-labelledby="btnAccountMenu"
                  className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl py-2 z-40"
                >
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
                    {resolvedAvatar && !avatarBroken ? (
                      <img
                        src={resolvedAvatar}
                        alt={resolvedName}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarBroken(true)}
                        className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0 bg-slate-100 dark:bg-slate-800"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="w-10 h-10 rounded-full border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 font-bold text-sm inline-flex items-center justify-center shrink-0"
                      >
                        {initial}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{resolvedName}</p>
                      {user.email ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                      ) : null}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                        <span>{getProviderLabel(user)}</span>
                        <span aria-hidden="true">·</span>
                        {isVerified ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                            <Cloud className="w-3 h-3 shrink-0" aria-hidden="true" />
                            {syncing ? 'Menyinkronkan...' : 'Cloud aktif'}
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                            Belum verifikasi email
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {!isVerified ? (
                    <div className="mx-3 my-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 p-2.5 space-y-2">
                      <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                        Verifikasi email Anda agar progres bisa disinkronkan ke cloud.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onResendVerification}
                          disabled={authBusy}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-[11px] font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer"
                        >
                          Kirim Ulang
                        </button>
                        <button
                          type="button"
                          onClick={onRefreshVerification}
                          disabled={authBusy}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 text-[11px] font-semibold text-white hover:bg-amber-700 cursor-pointer"
                        >
                          Cek Status
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      id="menuEditProfile"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenProfileModal();
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>Ubah Nama &amp; Foto Profil</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      id="menuSwitchAccount"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenAuthModal(true);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Users className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>Ganti Akun</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      id="menuSyncNow"
                      disabled={!isVerified || syncing}
                      onClick={() => {
                        setMenuOpen(false);
                        onManualSync();
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <RefreshCw
                        className={`w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 ${syncing ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>Sinkronkan Progres Sekarang</span>
                    </button>
                  </div>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  <button
                    type="button"
                    role="menuitem"
                    id="btnGoogleLogout"
                    disabled={authBusy}
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Keluar</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              id="btnOpenAuthModal"
              onClick={() => onOpenAuthModal(false)}
              disabled={authBusy}
              aria-label="Masuk ke akun untuk sinkronisasi progres"
              title="Masuk atau daftar akun"
              className="min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Masuk</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
