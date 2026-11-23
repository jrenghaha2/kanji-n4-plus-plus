import type { UserRole } from '../types/admin';

export const BOOTSTRAP_SUPERADMIN_EMAIL = 'jrenghaha2@gmail.com';
export const EMAIL_MAX_LENGTH = 160;
export const MODULE_LABEL_MAX_LENGTH = 120;
export const SCOPE_LABEL_MAX_LENGTH = 120;
export const EVENT_SUMMARY_MAX_LENGTH = 200;

export const VALID_USER_ROLES: readonly UserRole[] = ['user', 'admin', 'superadmin'] as const;

export const ROLE_META: Record<
  UserRole,
  {
    label: string;
    shortLabel: string;
    panelTitle: string;
    description: string;
  }
> = {
  user: {
    label: 'Pembelajar',
    shortLabel: 'Pembelajar',
    panelTitle: '',
    description: 'Akses belajar mandiri untuk kartu, daftar, dan kuis miliknya sendiri.',
  },
  admin: {
    label: 'Admin (Pantau)',
    shortLabel: 'Admin',
    panelTitle: 'Panel Admin',
    description: 'Akses pemantauan real-time read-only untuk aktivitas dan progres seluruh pengguna.',
  },
  superadmin: {
    label: 'Superadmin',
    shortLabel: 'Superadmin',
    panelTitle: 'Panel Superadmin',
    description: 'Pemantauan penuh serta wewenang mengangkat atau mencabut peran pengguna lain.',
  },
};

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().slice(0, EMAIL_MAX_LENGTH);
}

export function isValidUserRole(raw: unknown): raw is UserRole {
  return raw === 'user' || raw === 'admin' || raw === 'superadmin';
}

export function isBootstrapSuperAdminEmail(email?: string | null): boolean {
  return normalizeEmail(email) === BOOTSTRAP_SUPERADMIN_EMAIL;
}

export function resolveEffectiveRole(
  user: { email?: string | null; emailVerified?: boolean | null } | null | undefined,
  storedRole?: unknown
): UserRole {
  if (!user || !user.emailVerified) return 'user';
  if (isBootstrapSuperAdminEmail(user.email)) return 'superadmin';
  if (isValidUserRole(storedRole)) return storedRole;
  return 'user';
}

export function isAdminOrAbove(role: UserRole): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function isSuperAdminRole(role: UserRole): boolean {
  return role === 'superadmin';
}

export type RoleManageDenyReason =
  | 'not_superadmin'
  | 'bootstrap_protected'
  | 'self_protected';

export interface RoleManagePermission {
  allowed: boolean;
  reason?: RoleManageDenyReason;
}

export function canManageUserRole(
  actor: { uid: string; role: UserRole },
  target: { uid: string; email?: string | null }
): RoleManagePermission {
  if (actor.role !== 'superadmin') {
    return { allowed: false, reason: 'not_superadmin' };
  }
  if (isBootstrapSuperAdminEmail(target.email)) {
    return { allowed: false, reason: 'bootstrap_protected' };
  }
  if (actor.uid === target.uid) {
    return { allowed: false, reason: 'self_protected' };
  }
  return { allowed: true };
}

export function getRoleDisplayBadgeLabel(role: UserRole, email?: string | null): string {
  if (isBootstrapSuperAdminEmail(email)) return 'Superadmin Utama';
  return ROLE_META[role].label;
}

export function sanitizeBoundedText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, maxLen);
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
