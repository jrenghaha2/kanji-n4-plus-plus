import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail, X } from 'lucide-react';
import { FIREBASE_AUTH_PROVIDERS_URL } from '../firebase';

export type AuthModalView = 'signin' | 'signup' | 'reset';

interface AuthModalProps {
  open: boolean;
  isSwitchingAccount: boolean;
  busy: boolean;
  errorText: string | null;
  infoText: string | null;
  showConsoleHint: boolean;
  onClearNotice: () => void;
  onGoogleLogin: (forceSelectAccount: boolean) => void;
  onGithubLogin: () => void;
  onEmailSignIn: (email: string, password: string) => void;
  onEmailSignUp: (name: string, email: string, password: string) => void;
  onEmailReset: (email: string) => void;
  onClose: () => void;
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

function GithubGlyph() {
  return (
    <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

export function AuthModal({
  open,
  isSwitchingAccount,
  busy,
  errorText,
  infoText,
  showConsoleHint,
  onClearNotice,
  onGoogleLogin,
  onGithubLogin,
  onEmailSignIn,
  onEmailSignUp,
  onEmailReset,
  onClose,
}: AuthModalProps) {
  const [view, setView] = useState<AuthModalView>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setView('signin');
    setPassword('');
    setShowPass(false);
    const frame = requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusables = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (
        document.activeElement === last ||
        !modalRef.current.contains(document.activeElement)
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const switchView = (next: AuthModalView) => {
    setView(next);
    onClearNotice();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view === 'signin') {
      onEmailSignIn(email, password);
    } else if (view === 'signup') {
      onEmailSignUp(name, email, password);
    } else {
      onEmailReset(email);
    }
  };

  return (
    <div
      id="authModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="authModalTitle"
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 id="authModalTitle" className="text-base font-bold text-slate-900 dark:text-slate-50">
              {isSwitchingAccount ? 'Ganti Akun Belajar' : 'Masuk & Sinkronisasi Progres'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isSwitchingAccount
                ? 'Pilih akun lain untuk melanjutkan atau berpindah progres.'
                : 'Simpan progres hafalan kanji N4 secara otomatis ke cloud.'}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog login"
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-50 inline-flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              id="btnAuthGoogle"
              disabled={busy}
              onClick={() => onGoogleLogin(isSwitchingAccount)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <GoogleGlyph />
              <span>{isSwitchingAccount ? 'Pilih Akun Google' : 'Google'}</span>
            </button>

            <button
              type="button"
              id="btnAuthGithub"
              disabled={busy}
              onClick={onGithubLogin}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <GithubGlyph />
              <span>GitHub</span>
            </button>
          </div>

          <div className="relative flex items-center py-0.5">
            <div className="grow border-t border-slate-200 dark:border-slate-700" />
            <span className="shrink mx-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              atau dengan email
            </span>
            <div className="grow border-t border-slate-200 dark:border-slate-700" />
          </div>

          <div
            role="tablist"
            aria-label="Mode autentikasi email"
            className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'signin'}
              onClick={() => switchView('signin')}
              className={`min-h-[34px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                view === 'signin'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'signup'}
              onClick={() => switchView('signup')}
              className={`min-h-[34px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                view === 'signup'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50'
              }`}
            >
              Daftar Baru
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'reset'}
              onClick={() => switchView('reset')}
              className={`min-h-[34px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                view === 'reset'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50'
              }`}
            >
              Lupa Sandi
            </button>
          </div>

          {errorText ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200 space-y-1.5"
            >
              <p className="font-semibold">{errorText}</p>
              {showConsoleHint ? (
                <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                  Aktifkan metode login ini di{' '}
                  <a
                    href={FIREBASE_AUTH_PROVIDERS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold"
                  >
                    Firebase Console → Authentication → Sign-in method
                  </a>
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {infoText ? (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 font-medium"
            >
              {infoText}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-3">
            {view === 'signup' ? (
              <div>
                <label
                  htmlFor="authNameInput"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                >
                  Nama Tampilan
                </label>
                <input
                  id="authNameInput"
                  type="text"
                  maxLength={60}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-indigo-500"
                />
              </div>
            ) : null}

            <div>
              <label
                htmlFor="authEmailInput"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
              >
                Alamat Email
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="authEmailInput"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="nama@contoh.com"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-indigo-500"
                />
              </div>
            </div>

            {view !== 'reset' ? (
              <div>
                <label
                  htmlFor="authPasswordInput"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
                >
                  Kata Sandi
                </label>
                <div className="relative">
                  <KeyRound
                    className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="authPasswordInput"
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full h-10 pl-9 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    aria-label={showPass ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPass ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy
                ? 'Memproses...'
                : view === 'signin'
                  ? 'Masuk dengan Email'
                  : view === 'signup'
                    ? 'Buat Akun & Kirim Verifikasi'
                    : 'Kirim Link Reset Sandi'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
