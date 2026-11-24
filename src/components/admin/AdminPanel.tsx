import { useCallback, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Loader2,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  ActivityEventData,
  AdminKpiSummary,
  AdminPanelTab,
  MonitoredUserRow,
  UserDetailData,
  UserRole,
} from '../../types/admin';
import { ROLE_META, isSuperAdminRole } from '../../utils/rbac';
import { AdminEventFeedTab } from './AdminEventFeedTab';
import { AdminRealtimeTab } from './AdminRealtimeTab';
import { AdminUsersTab } from './AdminUsersTab';
import { UserDetailModal } from './UserDetailModal';

interface AdminPanelProps {
  actorUid: string;
  actorRole: UserRole;
  rows: readonly MonitoredUserRow[];
  events: readonly ActivityEventData[];
  kpis: AdminKpiSummary;
  loading: boolean;
  errorMessage: string | null;
  hydratingLegacy: boolean;
  hydratedCount: number;
  legacyTotalCount: number;
  nowMs: number;
  roleSavingUid: string | null;
  selectedDetailRow: MonitoredUserRow | null;
  detailData: UserDetailData | null;
  detailLoading: boolean;
  detailError: string | null;
  onOpenUserDetail: (uid: string) => void;
  onCloseUserDetail: () => void;
  onUpdateRole: (row: MonitoredUserRow, nextRole: UserRole) => Promise<boolean>;
}

const LIVE_ANSWER_KEY_STORAGE_KEY = 'n4_admin_live_show_answer_key';

function loadLiveAnswerKeyPreference(): boolean {
  try {
    const raw = localStorage.getItem(LIVE_ANSWER_KEY_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    // Ignore storage read errors in restricted iframe/private browsing contexts
  }
  return false;
}

export function AdminPanel({
  actorUid,
  actorRole,
  rows,
  events,
  kpis,
  loading,
  errorMessage,
  hydratingLegacy,
  hydratedCount,
  legacyTotalCount,
  nowMs,
  roleSavingUid,
  selectedDetailRow,
  detailData,
  detailLoading,
  detailError,
  onOpenUserDetail,
  onCloseUserDetail,
  onUpdateRole,
}: AdminPanelProps) {
  const [subTab, setSubTab] = useState<AdminPanelTab>('realtime');
  const [showLiveAnswerKey, setShowLiveAnswerKey] = useState<boolean>(() =>
    loadLiveAnswerKeyPreference()
  );

  const toggleLiveAnswerKey = useCallback(() => {
    setShowLiveAnswerKey(prev => {
      const next = !prev;
      try {
        localStorage.setItem(LIVE_ANSWER_KEY_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const isSuper = isSuperAdminRole(actorRole);
  const panelTitle = ROLE_META[actorRole].panelTitle || 'Panel Admin';

  const handleOpenDetail = useCallback(
    (row: MonitoredUserRow) => {
      onOpenUserDetail(row.uid);
    },
    [onOpenUserDetail]
  );

  const tabs: { key: AdminPanelTab; label: string; icon: typeof Radio }[] = [
    { key: 'realtime', label: 'Aktivitas Real-Time', icon: Radio },
    { key: 'events', label: 'Feed Kejadian', icon: Activity },
    {
      key: 'users',
      label: isSuper ? 'Kelola Role' : 'Daftar Pengguna',
      icon: Users,
    },
  ];

  return (
    <section aria-label={panelTitle} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0"
              aria-hidden="true"
            />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {panelTitle}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {isSuper
              ? 'Pemantauan aktivitas belajar real-time serta pengelolaan peran akses seluruh pengguna.'
              : 'Pemantauan aktivitas belajar, progres hafalan, dan hasil tes pengguna secara real-time (read-only).'}
          </p>
        </div>

        {hydratingLegacy ? (
          <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span className="font-mono-num">
              Menghidrasi statistik user lama ({hydratedCount}/{legacyTotalCount})...
            </span>
          </div>
        ) : null}
      </div>

      {/* Error alert */}
      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 flex items-start gap-3 text-sm text-rose-800 dark:text-rose-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {/* 4 Real-Time KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Sedang Online
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
            {kpis.onlineCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Aktif ≤ 2 menit terakhir
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Sedang Mengerjakan Tes
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono-num text-amber-700 dark:text-amber-400">
            {kpis.activeQuizCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Sesi kuis berjalan live
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pengguna Terdaftar
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono-num text-slate-900 dark:text-slate-50">
            {kpis.totalUsers}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Total akun terverifikasi
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between gap-1">
            <span>Total Sesi Tes/Kuis</span>
            <ClipboardList className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono-num text-indigo-700 dark:text-indigo-300">
            {kpis.totalQuizSessions}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Akumulasi live &amp; historis
          </div>
        </div>
      </div>

      {/* 3 Sub-Tabs */}
      <div
        role="tablist"
        aria-label="Navigasi Panel Pemantauan"
        className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-800/80"
      >
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = subTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(key)}
              className={`min-h-[42px] px-3.5 py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-white/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      {loading && rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <p className="text-sm font-medium">Menghubungkan ke stream pemantauan real-time...</p>
        </div>
      ) : subTab === 'realtime' ? (
        <AdminRealtimeTab
          rows={rows}
          nowMs={nowMs}
          showLiveAnswerKey={showLiveAnswerKey}
          onToggleLiveAnswerKey={toggleLiveAnswerKey}
          onOpenDetail={handleOpenDetail}
        />
      ) : subTab === 'events' ? (
        <AdminEventFeedTab events={events} nowMs={nowMs} />
      ) : (
        <AdminUsersTab
          rows={rows}
          actorUid={actorUid}
          actorRole={actorRole}
          roleSavingUid={roleSavingUid}
          nowMs={nowMs}
          onOpenDetail={handleOpenDetail}
          onUpdateRole={onUpdateRole}
        />
      )}

      {/* User Detail Modal (100% real-time via onSnapshot) */}
      <UserDetailModal
        row={selectedDetailRow}
        detail={detailData}
        loading={detailLoading}
        error={detailError}
        nowMs={nowMs}
        showLiveAnswerKey={showLiveAnswerKey}
        onToggleLiveAnswerKey={toggleLiveAnswerKey}
        onClose={onCloseUserDetail}
      />
    </section>
  );
}
