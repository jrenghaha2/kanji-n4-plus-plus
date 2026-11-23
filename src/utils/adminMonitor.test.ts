import test from 'node:test';
import assert from 'node:assert/strict';
import type { AdminUserRecord, HydratedUserStats, LiveActivityData } from '../types/admin';
import {
  ADMIN_SORT_OPTIONS,
  ONLINE_THRESHOLD_MS,
  RECENT_THRESHOLD_MS,
  computeAdminKpis,
  filterMonitoredUsers,
  getPresenceStatus,
  mergeUserMonitoringRows,
  sortMonitoredUsers,
} from './adminMonitor';
import {
  BOOTSTRAP_SUPERADMIN_EMAIL,
  canManageUserRole,
  getRoleDisplayBadgeLabel,
  isAdminOrAbove,
  isBootstrapSuperAdminEmail,
  isSuperAdminRole,
  resolveEffectiveRole,
} from './rbac';

test('3-tier RBAC helpers enforce Bootstrap Superadmin email_verified gate and hierarchy', () => {
  assert.equal(BOOTSTRAP_SUPERADMIN_EMAIL, 'jrenghaha2@gmail.com');
  assert.equal(isBootstrapSuperAdminEmail('JRENGHAHA2@GMAIL.COM '), true);
  assert.equal(isBootstrapSuperAdminEmail('other@gmail.com'), false);

  // Unverified accounts ALWAYS resolve to 'user', even with bootstrap email or stored superadmin role
  assert.equal(
    resolveEffectiveRole({ email: 'jrenghaha2@gmail.com', emailVerified: false }, 'superadmin'),
    'user'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'admin@example.com', emailVerified: false }, 'admin'),
    'user'
  );
  assert.equal(resolveEffectiveRole(null, 'superadmin'), 'user');

  // Verified Bootstrap Superadmin always resolves to 'superadmin', even if storedRole is missing or 'user'
  assert.equal(
    resolveEffectiveRole({ email: 'jrenghaha2@gmail.com', emailVerified: true }, undefined),
    'superadmin'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'JRENGHAHA2@gmail.com', emailVerified: true }, 'user'),
    'superadmin'
  );

  // Verified non-bootstrap accounts honor valid stored role and fallback to 'user'
  assert.equal(
    resolveEffectiveRole({ email: 'mod@example.com', emailVerified: true }, 'admin'),
    'admin'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'boss2@example.com', emailVerified: true }, 'superadmin'),
    'superadmin'
  );
  assert.equal(
    resolveEffectiveRole({ email: 'student@example.com', emailVerified: true }, 'invalid_role'),
    'user'
  );

  // Role predicates & display badges
  assert.equal(isAdminOrAbove('superadmin'), true);
  assert.equal(isAdminOrAbove('admin'), true);
  assert.equal(isAdminOrAbove('user'), false);
  assert.equal(isSuperAdminRole('superadmin'), true);
  assert.equal(isSuperAdminRole('admin'), false);
  assert.equal(isSuperAdminRole('user'), false);

  assert.equal(
    getRoleDisplayBadgeLabel('superadmin', 'jrenghaha2@gmail.com'),
    'Superadmin Utama'
  );
  assert.equal(getRoleDisplayBadgeLabel('superadmin', 'other@example.com'), 'Superadmin');
  assert.equal(getRoleDisplayBadgeLabel('admin', 'mod@example.com'), 'Admin (Pantau)');
  assert.equal(getRoleDisplayBadgeLabel('user', 'student@example.com'), 'Pembelajar');
});

test('canManageUserRole permanently protects Bootstrap Superadmin, self, and blocks Admin/User', () => {
  // Bootstrap Superadmin can manage regular users, admins, and secondary superadmins
  assert.deepEqual(
    canManageUserRole(
      { uid: 'boot_uid', role: 'superadmin' },
      { uid: 'u1', email: 'student@example.com' }
    ),
    { allowed: true }
  );
  assert.deepEqual(
    canManageUserRole(
      { uid: 'boot_uid', role: 'superadmin' },
      { uid: 'u2', email: 'admin@example.com' }
    ),
    { allowed: true }
  );

  // Secondary Superadmin CANNOT demote or modify Bootstrap Superadmin
  assert.deepEqual(
    canManageUserRole(
      { uid: 'super2_uid', role: 'superadmin' },
      { uid: 'boot_uid', email: 'jrenghaha2@gmail.com' }
    ),
    { allowed: false, reason: 'bootstrap_protected' }
  );
  assert.deepEqual(
    canManageUserRole(
      { uid: 'super2_uid', role: 'superadmin' },
      { uid: 'boot_uid', email: 'JRENGHAHA2@GMAIL.COM' }
    ),
    { allowed: false, reason: 'bootstrap_protected' }
  );

  // Superadmin CANNOT modify their own role
  assert.deepEqual(
    canManageUserRole(
      { uid: 'super2_uid', role: 'superadmin' },
      { uid: 'super2_uid', email: 'super2@example.com' }
    ),
    { allowed: false, reason: 'self_protected' }
  );
  assert.deepEqual(
    canManageUserRole(
      { uid: 'boot_uid', role: 'superadmin' },
      { uid: 'boot_uid', email: 'jrenghaha2@gmail.com' }
    ),
    { allowed: false, reason: 'bootstrap_protected' }
  );

  // Admin (read-only) and regular users CANNOT manage anyone's role
  assert.deepEqual(
    canManageUserRole(
      { uid: 'admin_uid', role: 'admin' },
      { uid: 'u1', email: 'student@example.com' }
    ),
    { allowed: false, reason: 'not_superadmin' }
  );
  assert.deepEqual(
    canManageUserRole(
      { uid: 'u1', role: 'user' },
      { uid: 'u2', email: 'other@example.com' }
    ),
    { allowed: false, reason: 'not_superadmin' }
  );
});

test('getPresenceStatus accurately classifies Online (<= 2m), Recent (<= 15m), and Offline', () => {
  const now = 1_700_000_000_000;
  assert.equal(getPresenceStatus(now, now), 'online');
  assert.equal(getPresenceStatus(now - ONLINE_THRESHOLD_MS, now), 'online');
  assert.equal(getPresenceStatus(now - ONLINE_THRESHOLD_MS - 1, now), 'recent');
  assert.equal(getPresenceStatus(now - RECENT_THRESHOLD_MS, now), 'recent');
  assert.equal(getPresenceStatus(now - RECENT_THRESHOLD_MS - 1, now), 'offline');
  assert.equal(getPresenceStatus(null, now), 'offline');
});

test('mergeUserMonitoringRows, computeAdminKpis, sortMonitoredUsers (all 5 modes), and filterMonitoredUsers', () => {
  const now = 1_700_000_000_000;

  const users: AdminUserRecord[] = [
    {
      uid: 'u_boot',
      displayName: 'Zaki Utama',
      email: 'jrenghaha2@gmail.com',
      avatarUrl: '',
      role: 'user', // even if stale in doc, bootstrap forces superadmin
      n4MasteredCount: 40,
      n4HardCount: 5,
      createdAtMs: now - 10_000_000,
      updatedAtMs: now - 30_000,
    },
    {
      uid: 'u_live_quiz',
      displayName: 'Budi Santoso',
      email: 'budi@example.com',
      avatarUrl: '',
      role: 'user',
      n4MasteredCount: 15,
      n4HardCount: 2,
      createdAtMs: now - 9_000_000,
      updatedAtMs: now - 40_000,
    },
    {
      uid: 'u_legacy',
      displayName: 'Ayu Lestari',
      email: 'ayu@example.com',
      avatarUrl: '',
      role: 'admin',
      n4MasteredCount: 120,
      n4HardCount: 8,
      createdAtMs: now - 50_000_000,
      updatedAtMs: now - 86_400_000,
    },
    {
      uid: 'u_recent',
      displayName: 'Citra Dewi',
      email: 'citra@example.com',
      avatarUrl: '',
      role: 'user',
      n4MasteredCount: 10,
      n4HardCount: 1,
      createdAtMs: now - 8_000_000,
      updatedAtMs: now - 5 * 60 * 1000,
    },
  ];

  const liveMap: Record<string, LiveActivityData> = {
    u_boot: {
      uid: 'u_boot',
      displayName: 'Zaki Utama',
      email: 'jrenghaha2@gmail.com',
      avatarUrl: '',
      role: 'superadmin',
      activityType: 'admin_panel',
      datasetMode: 'n4',
      datasetId: 'n4',
      moduleLabel: 'Panel Superadmin',
      scopeLabel: '',
      quizInProgress: false,
      quizCurrentQuestion: 0,
      quizTotalQuestions: 0,
      quizCorrectCount: 0,
      quizMode: '',
      totalMastered: 65,
      totalHard: 7,
      n4Mastered: 40,
      irodoriMastered: 25,
      totalQuizSessions: 3,
      lastQuizScore: 90,
      lastQuizTotal: 10,
      lastQuizDatasetId: 'n4',
      updatedAtMs: now - 20_000, // online
    },
    u_live_quiz: {
      uid: 'u_live_quiz',
      displayName: 'Budi Santoso',
      email: 'budi@example.com',
      avatarUrl: '',
      role: 'user',
      activityType: 'quiz_running',
      datasetMode: 'irodori',
      datasetId: 'dasar1',
      moduleLabel: 'Irodori Dasar 1 · Kuis',
      scopeLabel: 'Bab 1–3',
      quizInProgress: true,
      quizCurrentQuestion: 4,
      quizTotalQuestions: 10,
      quizCorrectCount: 3,
      quizMode: 'k2m',
      totalMastered: 20,
      totalHard: 2,
      n4Mastered: 15,
      irodoriMastered: 5,
      totalQuizSessions: 2,
      lastQuizScore: 70,
      lastQuizTotal: 10,
      lastQuizDatasetId: 'dasar1',
      updatedAtMs: now - 10_000, // online & active quiz
    },
    u_recent: {
      uid: 'u_recent',
      displayName: 'Citra Dewi',
      email: 'citra@example.com',
      avatarUrl: '',
      role: 'user',
      activityType: 'flashcard',
      datasetMode: 'n4',
      datasetId: 'n4',
      moduleLabel: 'Kanji N4 · Kartu',
      scopeLabel: 'Semua',
      quizInProgress: false,
      quizCurrentQuestion: 0,
      quizTotalQuestions: 0,
      quizCorrectCount: 0,
      quizMode: '',
      totalMastered: 10,
      totalHard: 1,
      n4Mastered: 10,
      irodoriMastered: 0,
      totalQuizSessions: 1,
      lastQuizScore: 80,
      lastQuizTotal: 10,
      lastQuizDatasetId: 'n4',
      updatedAtMs: now - 5 * 60 * 1000, // recent (5m ago)
    },
  };

  // Legacy user u_legacy has NO liveActivity doc, only hydrated subcollection stats
  const hydratedMap: Record<string, HydratedUserStats> = {
    u_legacy: {
      uid: 'u_legacy',
      irodoriMasteredByBook: { pemula: 50, dasar1: 30, dasar2: 0 },
      irodoriHardByBook: { pemula: 4, dasar1: 2, dasar2: 0 },
      irodoriMasteredTotal: 80,
      irodoriHardTotal: 6,
      totalQuizSessions: 12,
      lastQuizScore: 95,
      lastQuizTotal: 20,
      lastQuizDatasetId: 'pemula',
      lastQuizCompletedAtMs: now - 2 * 60 * 60 * 1000,
    },
  };

  const rows = mergeUserMonitoringRows(users, liveMap, hydratedMap, now);
  assert.equal(rows.length, 4);

  const bootRow = rows.find(r => r.uid === 'u_boot')!;
  assert.equal(bootRow.role, 'superadmin');
  assert.equal(bootRow.isBootstrapSuperAdmin, true);
  assert.equal(bootRow.presence, 'online');

  const legacyRow = rows.find(r => r.uid === 'u_legacy')!;
  assert.equal(legacyRow.hasLiveDoc, false);
  assert.equal(legacyRow.hasHydratedLegacy, true);
  assert.equal(legacyRow.totalMastered, 200); // 120 N4 + 80 Irodori hydrated
  assert.equal(legacyRow.totalQuizSessions, 12);
  assert.equal(legacyRow.lastQuizScore, 95);
  assert.equal(legacyRow.presence, 'offline');

  // KPIs accumulate live + hydrated legacy sessions
  const kpis = computeAdminKpis(rows);
  assert.deepEqual(kpis, {
    onlineCount: 2, // u_boot + u_live_quiz
    activeQuizCount: 1, // u_live_quiz
    totalUsers: 4,
    totalQuizSessions: 18, // 3 + 2 + 12 + 1
  });

  // Verify all 5 Sort options
  assert.equal(ADMIN_SORT_OPTIONS.length, 5);
  assert.deepEqual(
    sortMonitoredUsers(rows, 'recent').map(r => r.uid),
    ['u_live_quiz', 'u_boot', 'u_recent', 'u_legacy']
  );
  assert.deepEqual(
    sortMonitoredUsers(rows, 'alpha_asc').map(r => r.uid),
    ['u_legacy', 'u_live_quiz', 'u_recent', 'u_boot'] // Ayu, Budi, Citra, Zaki
  );
  assert.deepEqual(
    sortMonitoredUsers(rows, 'alpha_desc').map(r => r.uid),
    ['u_boot', 'u_recent', 'u_live_quiz', 'u_legacy'] // Zaki, Citra, Budi, Ayu
  );
  assert.deepEqual(
    sortMonitoredUsers(rows, 'mastered_desc').map(r => r.uid),
    ['u_legacy', 'u_boot', 'u_live_quiz', 'u_recent'] // 200, 65, 20, 10
  );
  assert.deepEqual(
    sortMonitoredUsers(rows, 'quiz_desc').map(r => r.uid),
    ['u_legacy', 'u_boot', 'u_live_quiz', 'u_recent'] // 12, 3, 2, 1
  );

  // Filters: search, presence, quiz_active, role
  assert.deepEqual(
    filterMonitoredUsers(rows, { search: 'budi' }).map(r => r.uid),
    ['u_live_quiz']
  );
  assert.deepEqual(
    filterMonitoredUsers(rows, { search: 'jrenghaha2@gmail.com' }).map(r => r.uid),
    ['u_boot']
  );
  assert.deepEqual(
    filterMonitoredUsers(rows, { presenceFilter: 'quiz_active' }).map(r => r.uid),
    ['u_live_quiz']
  );
  assert.deepEqual(
    filterMonitoredUsers(rows, { presenceFilter: 'recent' }).map(r => r.uid),
    ['u_recent']
  );
  assert.deepEqual(
    filterMonitoredUsers(rows, { roleFilter: 'admin' }).map(r => r.uid),
    ['u_legacy']
  );
  assert.deepEqual(
    filterMonitoredUsers(rows, { roleFilter: 'superadmin' }).map(r => r.uid),
    ['u_boot']
  );
});
