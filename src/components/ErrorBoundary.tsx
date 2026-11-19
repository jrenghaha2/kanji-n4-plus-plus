import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getFirestoreUpgradeUrl } from '../firebase';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const rawMsg = error.message || 'Terjadi kesalahan pada aplikasi.';
    const isQuotaExceeded = rawMsg.includes('Quota exceeded');
    const isFreeDailyReadLimit = rawMsg.includes('Free daily read units per project');

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div
          role="alert"
          className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/80 shadow-lg p-6 space-y-4"
        >
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {isQuotaExceeded
                ? 'Batas Kuota Firestore Tercapai'
                : 'Terjadi Gangguan Sinkronisasi'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {isQuotaExceeded
                ? 'Kuota harian gratis Firestore telah habis. Kuota akan direset keesokan hari (info paket Spark edisi Enterprise tersedia di halaman harga Firebase Firestore).'
                : 'Aplikasi mengalami kendala saat memproses data. Muat ulang halaman untuk melanjutkan belajar.'}
            </p>
          </div>

          {isFreeDailyReadLimit ? (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 p-3 text-xs text-amber-900 dark:text-amber-200 break-all">
              Kelola kuota database:{' '}
              <a
                href={getFirestoreUpgradeUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold"
              >
                {getFirestoreUpgradeUrl()}
              </a>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      </div>
    );
  }
}
