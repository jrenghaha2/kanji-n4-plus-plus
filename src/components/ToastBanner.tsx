import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ToastMessage } from '../types/kanji';

interface ToastBannerProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function ToastBanner({ toast, onDismiss }: ToastBannerProps) {
  if (!toast) return null;

  const toneStyles: Record<ToastMessage['tone'], string> = {
    success: 'bg-emerald-50 dark:bg-emerald-950/95 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100',
    error: 'bg-rose-50 dark:bg-rose-950/95 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100',
    warning: 'bg-amber-50 dark:bg-amber-950/95 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-100',
    info: 'bg-sky-50 dark:bg-sky-950/95 border-sky-200 dark:border-sky-800 text-sky-950 dark:text-sky-100',
  };

  const Icon =
    toast.tone === 'success'
      ? CheckCircle2
      : toast.tone === 'error'
        ? XCircle
        : toast.tone === 'warning'
          ? AlertTriangle
          : Info;

  return (
    <div
      role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'}
      aria-live="polite"
      className="fixed top-16 sm:top-auto sm:bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50"
    >
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 shadow-lg ${toneStyles[toast.tone]}`}
      >
        <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold leading-snug">{toast.title}</p>
          {toast.detail ? (
            <p className="mt-1 text-xs opacity-90 leading-relaxed whitespace-pre-line">
              {toast.detail}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup notifikasi"
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-indigo-500 shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
