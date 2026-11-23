import { useMemo, useState } from 'react';
import { ArrowUpDown, Check, Eye, Loader2, Lock, Search, ShieldCheck, X } from 'lucide-react';
import type { AdminSortOption, MonitoredUserRow, UserRole } from '../../types/admin';
import {
  ADMIN_SORT_OPTIONS,
  filterMonitoredUsers,
  formatRelativeTimeId,
  sortMonitoredUsers,
} from '../../utils/adminMonitor';
import {
  ROLE_META,
  canManageUserRole,
  getRoleDisplayBadgeLabel,
  isSuperAdminRole,
} from '../../utils/rbac';

interface AdminUsersTabProps {
  rows: readonly MonitoredUserRow[];
  actorUid: string;
  actorRole: UserRole;
  roleSavingUid: string | null;
  nowMs: number;
  onOpenDetail: (row: MonitoredUserRow) => void;
  onUpdateRole: (row: MonitoredUserRow, nextRole: UserRole) => Promise<boolean>;
}

const ROLE_FILTERS: readonly { key: 'all' | UserRole; label: string }[] = [
  { key: 'all', label: 'Semua Peran' },
  { key: 'superadmin', label: 'Superadmin' },
  { key: 'admin', label: 'Admin (Pantau)' },
  { key: 'user', label: 'Pembelajar' },
];

export function AdminUsersTab({
  rows,
  actorUid,
  actorRole,
  roleSavingUid,
  nowMs,
  onOpenDetail,
  onUpdateRole,
}: AdminUsersTabProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [sortBy, setSortBy] = useState<AdminSortOption>('recent');
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});

  const isSuper = isSuperAdminRole(actorRole);

  const counts = useMemo(() => {
    const c = { all: rows.length, superadmin: 0, admin: 0, user: 0 };
    for (const r of rows) {
      c[r.role] += 1;
    }
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = filterMonitoredUsers(rows, { search, roleFilter });
    return sortMonitoredUsers(filtered, sortBy);
  }, [rows, search, roleFilter, sortBy]);

  const handleConfirmRoleChange = async (row: MonitoredUserRow, nextRole: UserRole) => {
    const ok = await onUpdateRole(row, nextRole);
    if (ok) {
      setDraftRoles(prev => {
        const next = { ...prev };
        delete next[row.uid];
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Role Filter + Sort */}
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
              placeholder="Cari nama atau email pengguna..."
              aria-label="Cari pengguna di daftar pengguna"
              className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown
              className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0"
              aria-hidden="true"
            />
            <label htmlFor="usersSortSelect" className="sr-only">
              Urutkan daftar pengguna
            </label>
            <select
              id="usersSortSelect"
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
          aria-label="Filter berdasarkan peran"
          className="flex flex-wrap items-center gap-1.5"
        >
          {ROLE_FILTERS.map(opt => {
            const active = roleFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => setRoleFilter(opt.key)}
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

      {/* User Rows */}
      {visibleRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Tidak ada pengguna yang cocok dengan filter saat ini.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
          {visibleRows.map(row => {
            const perm = canManageUserRole(
              { uid: actorUid, role: actorRole },
              { uid: row.uid, email: row.email }
            );
            const selectedRole = draftRoles[row.uid] ?? row.role;
            const hasPendingChange = perm.allowed && selectedRole !== row.role;
            const isSaving = roleSavingUid === row.uid;
            const isDemotionToUser = hasPendingChange && selectedRole === 'user';
            const roleLabel = getRoleDisplayBadgeLabel(row.role, row.email);

            return (
              <div
                key={row.uid}
                className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Identity */}
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

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                          {row.displayName}
                        </span>
                        {row.uid === actorUid ? (
                          <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                            (Akun Anda)
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="truncate">{row.email || 'Email belum tersinkron'}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            row.role === 'superadmin'
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : row.role === 'admin'
                                ? 'text-teal-700 dark:text-teal-300'
                                : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {roleLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Aktif {formatRelativeTimeId(row.lastActiveMs, nowMs)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Stats + Controls */}
                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 shrink-0">
                    <div className="flex items-center gap-4 text-xs font-mono-num">
                      <div className="text-right">
                        <div className="text-slate-500 dark:text-slate-400">Hafalan</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {row.totalMastered}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-500 dark:text-slate-400">Tes</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {row.totalQuizSessions}
                        </div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-slate-500 dark:text-slate-400">Skor</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {row.lastQuizScore >= 0 ? `${row.lastQuizScore}%` : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(row)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Detail</span>
                      </button>

                      {/* Superadmin-only role selector; Admin sees ZERO role controls */}
                      {isSuper ? (
                        perm.allowed ? (
                          <div className="flex items-center gap-1.5">
                            <label htmlFor={`roleSelect-${row.uid}`} className="sr-only">
                              Pilih peran untuk {row.displayName}
                            </label>
                            <select
                              id={`roleSelect-${row.uid}`}
                              value={selectedRole}
                              disabled={isSaving}
                              onChange={e => {
                                const next = e.target.value as UserRole;
                                setDraftRoles(prev => {
                                  if (next === row.role) {
                                    const copy = { ...prev };
                                    delete copy[row.uid];
                                    return copy;
                                  }
                                  return { ...prev, [row.uid]: next };
                                });
                              }}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                              <option value="user">{ROLE_META.user.label}</option>
                              <option value="admin">{ROLE_META.admin.label}</option>
                              <option value="superadmin">{ROLE_META.superadmin.label}</option>
                            </select>
                          </div>
                        ) : (
                          <span className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 whitespace-nowrap">
                            {perm.reason === 'bootstrap_protected' ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
                                <span>Superadmin Utama</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Akun Anda</span>
                              </>
                            )}
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Inline confirmation bar when Superadmin changes a dropdown */}
                {isSuper && hasPendingChange ? (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <p className="text-amber-950 dark:text-amber-200 font-medium">
                      Ubah peran <strong>{row.displayName}</strong> dari{' '}
                      <strong>{ROLE_META[row.role].label}</strong> menjadi{' '}
                      <strong>{ROLE_META[selectedRole].label}</strong>?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void handleConfirmRoleChange(row, selectedRole)}
                        className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                          isDemotionToUser
                            ? 'bg-rose-600 hover:bg-rose-700'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{isDemotionToUser ? 'Cabut Akses' : 'Simpan'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          setDraftRoles(prev => {
                            const copy = { ...prev };
                            delete copy[row.uid];
                            return copy;
                          })
                        }
                        className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Batal</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
