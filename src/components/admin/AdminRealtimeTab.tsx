import { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp, Eye, Radio, Search } from 'lucide-react';
import type {
  AdminPresenceStatus,
  AdminSortOption,
  MonitoredUserRow,
} from '../../types/admin';
import {
  ADMIN_SORT_OPTIONS,
  DATASET_SHORT_LABELS,
  filterMonitoredUsers,
  formatRelativeTimeId,
  sortMonitoredUsers,
} from '../../utils/adminMonitor';
import { getRoleDisplayBadgeLabel } from '../../utils/rbac';
import { LiveQuizMonitorCard } from './LiveQuizMonitorCard';

interface AdminRealtimeTabProps {
  rows: readonly MonitoredUserRow[];
  nowMs: number;
  onOpenDetail: (row: MonitoredUserRow) => void;
}

type PresenceFilter = 'all' | AdminPresenceStatus | 'quiz_active';

const PRESENCE_FILTERS: readonly { key: PresenceFilter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'online', label: 'Online' },
  { key: 'recent', label: 'Baru Aktif' },
  { key: 'quiz_active', label: 'Sedang Tes' },
  { key: 'offline', label: 'Offline' },
];

export function AdminRealtimeTab({ rows, nowMs, onOpenDetail }: AdminRealtimeTabProps) {
  const [search, setSearch] = useState('');
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
  const [sortBy, setSortBy] = useState<AdminSortOption>('recent');
  const [collapsedLiveUids, setCollapsedLiveUids] = useState<Record<string, boolean>>({});

  const toggleLiveInspector = (uid: string) => {
    setCollapsedLiveUids(prev => ({
      ...prev,
      [uid]: !prev[uid],
    }));
  };

  const counts = useMemo(() => {
    let online = 0;
    let recent = 0;
    let offline = 0;
    let quizActive = 0;
    for (const r of rows) {
      if (r.presence === 'online') online += 1;
      else if (r.presence === 'recent') recent += 1;
      else offline += 1;
      if (r.quizInProgress) quizActive += 1;
    }
    return { all: rows.length, online, recent, offline, quiz_active: quizActive };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = filterMonitoredUsers(rows, { search, presenceFilter });
    return sortMonitoredUsers(filtered, sortBy);
  }, [rows, search, presenceFilter, sortBy]);

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Presence filter + Sort */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama, email, atau modul aktif..."
              aria-label="Cari pengguna di aktivitas real-time"
              className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown
              className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0"
              aria-hidden="true"
            />
            <label htmlFor="realtimeSortSelect" className="sr-only">
              Urutkan aktivitas real-time
            </label>
            <select
              id="realtimeSortSelect"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as AdminSortOption)}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ADMIN_SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  Urutkan: {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          role="group"
          aria-label="Filter status kehadiran"
          className="flex flex-wrap items-center gap-1.5"
        >
          {PRESENCE_FILTERS.map(opt => {
            const active = presenceFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => setPresenceFilter(opt.key)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 border-slate-900 text-white dark:bg-indigo-600 dark:border-indigo-500 dark:text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span>{opt.label}</span>
                <span className="font-mono-num opacity-80">{counts[opt.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      {visibleRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Tidak ada pengguna yang cocok dengan filter pencarian saat ini.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
          {visibleRows.map(row => {
            const presenceLabel =
              row.presence === 'online'
                ? 'Online'
                : row.presence === 'recent'
                  ? 'Baru aktif'
                  : 'Offline';
            const presenceTextClass =
              row.presence === 'online'
                ? 'text-emerald-700 dark:text-emerald-400'
                : row.presence === 'recent'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400';
            const quizPct =
              row.quizTotalQuestions > 0
                ? Math.min(
                    100,
                    Math.round((row.quizCurrentQuestion / row.quizTotalQuestions) * 100)
                  )
                : 0;

            const hasLiveQuizView = Boolean(
              row.liveQuizCurrent || row.liveQuizLog.length > 0
            );
            const isLiveExpanded =
              hasLiveQuizView &&
              (row.quizInProgress
                ? !collapsedLiveUids[row.uid]
                : Boolean(collapsedLiveUids[row.uid]));

            return (
              <div
                key={row.uid}
                className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors space-y-3"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left: identity + live module */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {row.avatarUrl ? (
                    <img
                      src={row.avatarUrl}
                      alt={row.displayName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="w-10 h-10 rounded-full border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 font-bold text-sm inline-flex items-center justify-center shrink-0"
                    >
                      {row.displayName.charAt(0).toUpperCase() || 'U'}
                    </span>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                        {row.displayName}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className={`text-xs font-semibold ${presenceTextClass}`}>
                        {presenceLabel}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatRelativeTimeId(row.lastActiveMs, nowMs)}
                      </span>
                      {row.role !== 'user' ? (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                            ·
                          </span>
                          <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                            {getRoleDisplayBadgeLabel(row.role, row.email)}
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {row.moduleLabel}
                      </span>
                      {row.scopeLabel ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}
                          — {row.scopeLabel}
                        </span>
                      ) : null}
                    </div>

                    {row.quizInProgress ? (
                      <div className="pt-1 max-w-md space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono-num">
                          <span className="font-semibold text-amber-700 dark:text-amber-300">
                            Sedang Mengerjakan Tes: Soal {row.quizCurrentQuestion}/
                            {row.quizTotalQuestions}
                          </span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {row.quizCorrectCount} benar
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 dark:bg-amber-400 transition-all"
                            style={{ width: `${quizPct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Right: compact stats + Detail button */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between md:justify-end gap-4 shrink-0">
                  <div className="flex items-center gap-4 text-xs font-mono-num">
                    <div className="text-right">
                      <div className="text-slate-500 dark:text-slate-400">Hafalan</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {row.totalMastered}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500 dark:text-slate-400">Sesi Tes</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {row.totalQuizSessions}
                      </div>
                    </div>
                    <div className="text-right min-w-[74px]">
                      <div className="text-slate-500 dark:text-slate-400">Skor Akhir</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {row.lastQuizScore >= 0 ? (
                          <span
                            className={
                              row.lastQuizScore >= 80
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : row.lastQuizScore >= 60
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-700 dark:text-rose-400'
                            }
                          >
                            {row.lastQuizScore}%
                            {row.lastQuizDatasetId ? (
                              <span className="block text-[10px] font-sans font-normal text-slate-500 dark:text-slate-400">
                                {DATASET_SHORT_LABELS[row.lastQuizDatasetId]}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {hasLiveQuizView ? (
                      <button
                        type="button"
                        onClick={() => toggleLiveInspector(row.uid)}
                        aria-expanded={isLiveExpanded}
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          row.quizInProgress
                            ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200'
                            : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200'
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{isLiveExpanded ? 'Tutup Soal' : 'Pantau Soal'}</span>
                        {isLiveExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onOpenDetail(row)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Detail</span>
                    </button>
                  </div>
                </div>
                </div>

                {isLiveExpanded ? <LiveQuizMonitorCard row={row} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
