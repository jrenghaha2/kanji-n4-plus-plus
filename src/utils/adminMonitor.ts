import type {
  AdminKpiSummary,
  AdminPresenceStatus,
  AdminSortOption,
  AdminUserRecord,
  HydratedUserStats,
  LiveActivityData,
  LiveActivityType,
  MonitoredUserRow,
  UserRole,
} from '../types/admin';
import type { QuizDatasetId } from '../types/kanji';
import { decodeLiveQuizLog, decodeLiveQuizToken } from './liveQuizSync';
import { isBootstrapSuperAdminEmail } from './rbac';

export const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
export const RECENT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export const ADMIN_SORT_OPTIONS: readonly { value: AdminSortOption; label: string }[] = [
  { value: 'recent', label: 'Waktu Terbaru' },
  { value: 'alpha_asc', label: 'Abjad (A–Z)' },
  { value: 'alpha_desc', label: 'Abjad (Z–A)' },
  { value: 'mastered_desc', label: 'Hafalan / Progres Terbanyak' },
  { value: 'quiz_desc', label: 'Tes / Kuis Terbanyak' },
] as const;

export const DATASET_SHORT_LABELS: Record<QuizDatasetId, string> = {
  n4: 'Kanji N4',
  pemula: 'Irodori Pemula',
  dasar1: 'Irodori Dasar 1',
  dasar2: 'Irodori Dasar 2',
};

export const ACTIVITY_TYPE_LABELS: Record<LiveActivityType, string> = {
  browsing: 'Menjelajah Aplikasi',
  flashcard: 'Belajar Kartu Flashcard',
  list: 'Membuka Daftar Kosakata',
  quiz_setup: 'Menyiapkan Kuis',
  quiz_running: 'Sedang Mengerjakan Tes',
  quiz_result: 'Melihat Hasil Tes',
  admin_panel: 'Membuka Panel Pantau',
};

export function getPresenceStatus(
  lastActiveMs: number | null,
  nowMs: number = Date.now()
): AdminPresenceStatus {
  if (lastActiveMs === null || !Number.isFinite(lastActiveMs)) return 'offline';
  const diff = Math.max(0, nowMs - lastActiveMs);
  if (diff <= ONLINE_THRESHOLD_MS) return 'online';
  if (diff <= RECENT_THRESHOLD_MS) return 'recent';
  return 'offline';
}

export function getDisplaySortName(row: Pick<MonitoredUserRow, 'displayName' | 'email' | 'uid'>): string {
  const candidate = row.displayName.trim() || row.email.trim() || row.uid;
  return candidate.toLocaleLowerCase('id-ID');
}

export function mergeUserMonitoringRows(
  users: readonly AdminUserRecord[],
  liveMap: Readonly<Record<string, LiveActivityData>>,
  hydratedMap: Readonly<Record<string, HydratedUserStats>>,
  nowMs: number = Date.now()
): MonitoredUserRow[] {
  return users.map(user => {
    const live = liveMap[user.uid];
    const hydrated = hydratedMap[user.uid];

    const email = user.email || live?.email || '';
    const isBootstrap = isBootstrapSuperAdminEmail(email);
    const effectiveRole: UserRole = isBootstrap ? 'superadmin' : user.role;
    const displayName =
      user.displayName || live?.displayName || (email ? email.split('@')[0] : 'Pengguna');
    const avatarUrl = user.avatarUrl || live?.avatarUrl || '';

    const lastActiveMs =
      live?.updatedAtMs ??
      hydrated?.lastQuizCompletedAtMs ??
      user.updatedAtMs ??
      user.createdAtMs ??
      null;
    const presence = getPresenceStatus(live?.updatedAtMs ?? null, nowMs);

    const n4Mastered = Math.max(user.n4MasteredCount, live?.n4Mastered ?? 0);
    const irodoriMastered = Math.max(
      live?.irodoriMastered ?? 0,
      hydrated?.irodoriMasteredTotal ?? 0
    );
    const totalMastered = Math.max(
      n4Mastered + irodoriMastered,
      live?.totalMastered ?? 0
    );
    const totalHard = Math.max(
      user.n4HardCount + (hydrated?.irodoriHardTotal ?? 0),
      live?.totalHard ?? 0
    );

    const totalQuizSessions = Math.max(
      live?.totalQuizSessions ?? 0,
      hydrated?.totalQuizSessions ?? 0
    );

    const liveHasScore = live !== undefined && live.lastQuizScore >= 0;
    const hydratedHasScore = hydrated !== undefined && hydrated.lastQuizScore >= 0;
    const lastQuizScore = liveHasScore
      ? live.lastQuizScore
      : hydratedHasScore
        ? hydrated.lastQuizScore
        : -1;
    const lastQuizTotal = liveHasScore
      ? live.lastQuizTotal
      : hydratedHasScore
        ? hydrated.lastQuizTotal
        : 0;
    const lastQuizDatasetId = liveHasScore
      ? live.lastQuizDatasetId
      : hydratedHasScore
        ? hydrated.lastQuizDatasetId
        : '';

    // Consider a quiz actively running only if user is online/recent AND flagged quizInProgress
    const isFreshPresence = presence === 'online' || presence === 'recent';
    const quizInProgress = Boolean(live?.quizInProgress && isFreshPresence);
    const datasetId: QuizDatasetId = live?.datasetId ?? 'n4';
    const liveQuizCurrent =
      quizInProgress && live?.quizCurrentToken
        ? decodeLiveQuizToken(live.quizCurrentToken, datasetId)
        : null;
    const showLiveLog = Boolean(
      live?.quizLiveLog &&
        (quizInProgress || (live.activityType === 'quiz_result' && isFreshPresence))
    );
    const liveQuizLog = showLiveLog
      ? decodeLiveQuizLog(live?.quizLiveLog, datasetId)
      : [];

    return {
      uid: user.uid,
      displayName,
      email,
      avatarUrl,
      role: effectiveRole,
      isBootstrapSuperAdmin: isBootstrap,
      presence,
      lastActiveMs,
      hasLiveDoc: Boolean(live),
      hasHydratedLegacy: Boolean(hydrated),
      activityType: live?.activityType ?? null,
      datasetId,
      moduleLabel: live?.moduleLabel || 'Belum ada aktivitas live',
      scopeLabel: live?.scopeLabel || '',
      quizInProgress,
      quizCurrentQuestion: quizInProgress ? live?.quizCurrentQuestion ?? 0 : 0,
      quizTotalQuestions: quizInProgress ? live?.quizTotalQuestions ?? 0 : 0,
      quizCorrectCount: quizInProgress ? live?.quizCorrectCount ?? 0 : 0,
      quizMode: quizInProgress ? live?.quizMode ?? '' : '',
      liveQuizCurrent,
      liveQuizLog,
      n4Mastered,
      n4Hard: user.n4HardCount,
      irodoriMastered,
      totalMastered,
      totalHard,
      totalQuizSessions,
      lastQuizScore,
      lastQuizTotal,
      lastQuizDatasetId,
      createdAtMs: user.createdAtMs,
    };
  });
}

export function computeAdminKpis(rows: readonly MonitoredUserRow[]): AdminKpiSummary {
  let onlineCount = 0;
  let activeQuizCount = 0;
  let totalQuizSessions = 0;

  for (const row of rows) {
    if (row.presence === 'online') onlineCount += 1;
    if (row.quizInProgress) activeQuizCount += 1;
    totalQuizSessions += row.totalQuizSessions;
  }

  return {
    onlineCount,
    activeQuizCount,
    totalUsers: rows.length,
    totalQuizSessions,
  };
}

export function sortMonitoredUsers(
  rows: readonly MonitoredUserRow[],
  sortBy: AdminSortOption
): MonitoredUserRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortBy === 'alpha_asc') {
      const cmp = getDisplaySortName(a).localeCompare(getDisplaySortName(b), 'id-ID');
      return cmp !== 0 ? cmp : a.uid.localeCompare(b.uid);
    }
    if (sortBy === 'alpha_desc') {
      const cmp = getDisplaySortName(b).localeCompare(getDisplaySortName(a), 'id-ID');
      return cmp !== 0 ? cmp : b.uid.localeCompare(a.uid);
    }
    if (sortBy === 'mastered_desc') {
      if (b.totalMastered !== a.totalMastered) return b.totalMastered - a.totalMastered;
      if (b.totalQuizSessions !== a.totalQuizSessions) {
        return b.totalQuizSessions - a.totalQuizSessions;
      }
      return getDisplaySortName(a).localeCompare(getDisplaySortName(b), 'id-ID');
    }
    if (sortBy === 'quiz_desc') {
      if (b.totalQuizSessions !== a.totalQuizSessions) {
        return b.totalQuizSessions - a.totalQuizSessions;
      }
      if (b.totalMastered !== a.totalMastered) return b.totalMastered - a.totalMastered;
      return getDisplaySortName(a).localeCompare(getDisplaySortName(b), 'id-ID');
    }
    // Default: 'recent' (Waktu Terbaru)
    const aTime = a.lastActiveMs ?? 0;
    const bTime = b.lastActiveMs ?? 0;
    if (bTime !== aTime) return bTime - aTime;
    return getDisplaySortName(a).localeCompare(getDisplaySortName(b), 'id-ID');
  });
  return copy;
}

export interface MonitorFilterOptions {
  search?: string;
  presenceFilter?: 'all' | AdminPresenceStatus | 'quiz_active';
  roleFilter?: 'all' | UserRole;
}

export function filterMonitoredUsers(
  rows: readonly MonitoredUserRow[],
  options: MonitorFilterOptions
): MonitoredUserRow[] {
  const q = (options.search ?? '').trim().toLocaleLowerCase('id-ID');
  const presenceFilter = options.presenceFilter ?? 'all';
  const roleFilter = options.roleFilter ?? 'all';

  return rows.filter(row => {
    if (presenceFilter === 'quiz_active' && !row.quizInProgress) return false;
    if (
      presenceFilter !== 'all' &&
      presenceFilter !== 'quiz_active' &&
      row.presence !== presenceFilter
    ) {
      return false;
    }
    if (roleFilter !== 'all' && row.role !== roleFilter) return false;
    if (q) {
      const hay = `${row.displayName} ${row.email} ${row.moduleLabel}`.toLocaleLowerCase('id-ID');
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function formatRelativeTimeId(
  timestampMs: number | null,
  nowMs: number = Date.now()
): string {
  if (timestampMs === null || !Number.isFinite(timestampMs)) return 'Belum tercatat';
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 15) return 'Baru saja';
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} hari lalu`;
  return new Date(timestampMs).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatAbsoluteTimeId(timestampMs: number | null): string {
  if (timestampMs === null || !Number.isFinite(timestampMs)) return '—';
  return new Date(timestampMs).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function extractTimestampMs(val: unknown): number | null {
  if (!val) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof val === 'object' && val !== null) {
    const maybeTs = val as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') {
      const ms = maybeTs.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybeTs.seconds === 'number') {
      return maybeTs.seconds * 1000;
    }
  }
  return null;
}
