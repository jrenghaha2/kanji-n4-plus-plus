import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { VALID_KANJI_IDS } from '../data/kanjiData';
import type { IrodoriBookId } from '../types/kanji';

// Volumetric & regex boundaries synchronized verbatim with firebase-blueprint.json
export const UID_MIN_LENGTH = 1;
export const UID_MAX_LENGTH = 128;
export const UID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const KANJI_ID_PATTERN = /^n([1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$/;
export const MAX_KANJI_LIST_SIZE = 500;
export const DISPLAY_NAME_MAX_LENGTH = 60;
export const EMAIL_MAX_LENGTH = 160;
export const AVATAR_URL_MAX_LENGTH = 20000;
export const AVATAR_URL_PATTERN =
  /^(|https:\/\/.*|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;

export const IRODORI_BOOK_SYNC_RULES: Record<
  IrodoriBookId,
  { pattern: RegExp; maxSize: number; maxJoinedLength: number }
> = {
  pemula: {
    pattern: /^irp([1-9]|[1-9][0-9]|[1-9][0-9]{2}|10[0-9]{2}|11[0-2][0-9]|113[0-6])$/,
    maxSize: 1136,
    maxJoinedLength: 9500,
  },
  dasar1: {
    pattern: /^ir([1-9]|[1-9][0-9]|[1-9][0-9]{2}|10[0-5][0-9]|106[0-7])$/,
    maxSize: 1067,
    maxJoinedLength: 8000,
  },
  dasar2: {
    pattern: /^ir2_([1-9]|[1-9][0-9]|[1-9][0-9]{2}|1[0-1][0-9]{2}|12[0-7][0-9]|128[0-8])$/,
    maxSize: 1288,
    maxJoinedLength: 12000,
  },
};

export interface SanitizedProgressLists {
  mastered: string[];
  hard: string[];
}

export interface ProgressSyncPayload {
  uid: string;
  mastered: string[];
  hard: string[];
}

export interface IrodoriProgressSyncPayload {
  uid: string;
  bookId: IrodoriBookId;
  mastered: string[];
  hard: string[];
}

export interface UserProfileWriteData {
  displayName: string;
  avatarUrl: string;
}

export function isValidFirebaseUid(uid: unknown): uid is string {
  return (
    typeof uid === 'string' &&
    uid.length >= UID_MIN_LENGTH &&
    uid.length <= UID_MAX_LENGTH &&
    UID_PATTERN.test(uid)
  );
}

export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
}

export function isValidAvatarUrl(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    raw.length <= AVATAR_URL_MAX_LENGTH &&
    AVATAR_URL_PATTERN.test(raw)
  );
}

export function sanitizeAvatarUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return isValidAvatarUrl(trimmed) ? trimmed : '';
}

export function buildUserProfileWriteData(
  rawDisplayName: unknown,
  rawAvatarUrl: unknown
): UserProfileWriteData {
  const displayName = sanitizeDisplayName(rawDisplayName);
  const trimmedAvatar = typeof rawAvatarUrl === 'string' ? rawAvatarUrl.trim() : '';
  if (trimmedAvatar && !isValidAvatarUrl(trimmedAvatar)) {
    throw new Error(
      'Foto profil harus berupa URL HTTPS atau gambar JPEG/PNG/WebP terkompresi (maksimal ~15 KB).'
    );
  }
  return {
    displayName,
    avatarUrl: trimmedAvatar,
  };
}

/**
 * Sanitizes, deduplicates, enforces Kanji ID allowlist & blueprint bounds (<= 500),
 * and ensures an item marked mastered is never duplicated inside hard.
 */
export function sanitizeProgressLists(
  rawMastered: Iterable<unknown>,
  rawHard: Iterable<unknown>,
  validIds: Set<string> = VALID_KANJI_IDS
): SanitizedProgressLists {
  const masteredSet = new Set<string>();
  for (const id of rawMastered) {
    if (typeof id === 'string' && KANJI_ID_PATTERN.test(id) && validIds.has(id)) {
      masteredSet.add(id);
      if (masteredSet.size >= MAX_KANJI_LIST_SIZE) break;
    }
  }

  const hardSet = new Set<string>();
  for (const id of rawHard) {
    if (
      typeof id === 'string' &&
      KANJI_ID_PATTERN.test(id) &&
      validIds.has(id) &&
      !masteredSet.has(id)
    ) {
      hardSet.add(id);
      if (hardSet.size >= MAX_KANJI_LIST_SIZE) break;
    }
  }

  return {
    mastered: [...masteredSet],
    hard: [...hardSet],
  };
}

/**
 * Builds a validated Firestore mutation payload conforming strictly to firebase-blueprint.json.
 */
export function buildUserProgressWriteData(
  uid: string,
  mastered: Iterable<unknown>,
  hard: Iterable<unknown>,
  validIds: Set<string> = VALID_KANJI_IDS
): ProgressSyncPayload {
  if (!isValidFirebaseUid(uid)) {
    throw new Error('UID pengguna tidak valid untuk sinkronisasi Firestore.');
  }
  const clean = sanitizeProgressLists(mastered, hard, validIds);
  return {
    uid,
    mastered: clean.mastered,
    hard: clean.hard,
  };
}

/**
 * Merges two progress states using union semantics where `mastered` always takes precedence over `hard`.
 */
export function mergeProgressSets(
  primaryMastered: Set<string>,
  primaryHard: Set<string>,
  secondaryMastered: Iterable<unknown>,
  secondaryHard: Iterable<unknown>,
  validIds: Set<string> = VALID_KANJI_IDS
): { mastered: Set<string>; hard: Set<string>; addedFromSecondary: number } {
  const cleanPrimary = sanitizeProgressLists(primaryMastered, primaryHard, validIds);
  const cleanSecondary = sanitizeProgressLists(secondaryMastered, secondaryHard, validIds);

  const mergedMastered = new Set<string>(cleanPrimary.mastered);
  let addedFromSecondary = 0;

  for (const id of cleanSecondary.mastered) {
    if (!mergedMastered.has(id)) {
      mergedMastered.add(id);
      addedFromSecondary += 1;
    }
  }

  const mergedHard = new Set<string>();
  for (const id of cleanPrimary.hard) {
    if (!mergedMastered.has(id)) {
      mergedHard.add(id);
    }
  }
  for (const id of cleanSecondary.hard) {
    if (!mergedMastered.has(id) && !mergedHard.has(id)) {
      mergedHard.add(id);
      addedFromSecondary += 1;
    }
  }

  return {
    mastered: mergedMastered,
    hard: mergedHard,
    addedFromSecondary,
  };
}

export function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function markKanjiMastered(
  mastered: Set<string>,
  hard: Set<string>,
  id: string
): { nextMastered: Set<string>; nextHard: Set<string>; isNewMastered: boolean } {
  const nextMastered = new Set(mastered);
  const nextHard = new Set(hard);
  const isNewMastered = !nextMastered.has(id);
  nextMastered.add(id);
  nextHard.delete(id);
  return { nextMastered, nextHard, isNewMastered };
}

export function markKanjiHard(
  mastered: Set<string>,
  hard: Set<string>,
  id: string
): { nextMastered: Set<string>; nextHard: Set<string> } {
  const nextMastered = new Set(mastered);
  const nextHard = new Set(hard);
  nextHard.add(id);
  nextMastered.delete(id);
  return { nextMastered, nextHard };
}

export function isValidIrodoriBookId(raw: unknown): raw is IrodoriBookId {
  return raw === 'pemula' || raw === 'dasar1' || raw === 'dasar2';
}

/**
 * Sanitizes, deduplicates, enforces per-book Irodori ID allowlist & blueprint bounds,
 * and guarantees mastered and hard sets are mutually exclusive.
 */
export function sanitizeIrodoriProgressLists(
  bookId: IrodoriBookId,
  rawMastered: Iterable<unknown>,
  rawHard: Iterable<unknown>,
  validIds: Set<string> = IRODORI_BOOKS[bookId].validIds
): SanitizedProgressLists {
  const { pattern, maxSize } = IRODORI_BOOK_SYNC_RULES[bookId];

  const masteredSet = new Set<string>();
  for (const id of rawMastered) {
    if (typeof id === 'string' && pattern.test(id) && validIds.has(id)) {
      masteredSet.add(id);
      if (masteredSet.size >= maxSize) break;
    }
  }

  const hardSet = new Set<string>();
  for (const id of rawHard) {
    if (
      typeof id === 'string' &&
      pattern.test(id) &&
      validIds.has(id) &&
      !masteredSet.has(id)
    ) {
      hardSet.add(id);
      if (hardSet.size >= maxSize) break;
    }
  }

  return {
    mastered: [...masteredSet],
    hard: [...hardSet],
  };
}

/**
 * Builds a validated Firestore mutation payload for /users/{uid}/irodoriProgress/{bookId}
 * conforming strictly to firebase-blueprint.json.
 */
export function buildIrodoriProgressWriteData(
  uid: string,
  bookId: IrodoriBookId,
  mastered: Iterable<unknown>,
  hard: Iterable<unknown>,
  validIds: Set<string> = IRODORI_BOOKS[bookId].validIds
): IrodoriProgressSyncPayload {
  if (!isValidFirebaseUid(uid)) {
    throw new Error('UID pengguna tidak valid untuk sinkronisasi Firestore.');
  }
  if (!isValidIrodoriBookId(bookId)) {
    throw new Error('Identitas buku Irodori tidak valid untuk sinkronisasi Firestore.');
  }
  const clean = sanitizeIrodoriProgressLists(bookId, mastered, hard, validIds);
  return {
    uid,
    bookId,
    mastered: clean.mastered,
    hard: clean.hard,
  };
}

/**
 * Merges two Irodori book progress states using union semantics where `mastered`
 * always takes precedence over `hard`.
 */
export function mergeIrodoriProgressSets(
  bookId: IrodoriBookId,
  primaryMastered: Set<string>,
  primaryHard: Set<string>,
  secondaryMastered: Iterable<unknown>,
  secondaryHard: Iterable<unknown>,
  validIds: Set<string> = IRODORI_BOOKS[bookId].validIds
): { mastered: Set<string>; hard: Set<string>; addedFromSecondary: number } {
  const cleanPrimary = sanitizeIrodoriProgressLists(
    bookId,
    primaryMastered,
    primaryHard,
    validIds
  );
  const cleanSecondary = sanitizeIrodoriProgressLists(
    bookId,
    secondaryMastered,
    secondaryHard,
    validIds
  );

  const mergedMastered = new Set<string>(cleanPrimary.mastered);
  let addedFromSecondary = 0;

  for (const id of cleanSecondary.mastered) {
    if (!mergedMastered.has(id)) {
      mergedMastered.add(id);
      addedFromSecondary += 1;
    }
  }

  const mergedHard = new Set<string>();
  for (const id of cleanPrimary.hard) {
    if (!mergedMastered.has(id)) {
      mergedHard.add(id);
    }
  }
  for (const id of cleanSecondary.hard) {
    if (!mergedMastered.has(id) && !mergedHard.has(id)) {
      mergedHard.add(id);
      addedFromSecondary += 1;
    }
  }

  return {
    mastered: mergedMastered,
    hard: mergedHard,
    addedFromSecondary,
  };
}
