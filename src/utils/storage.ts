import { VALID_KANJI_IDS } from '../data/kanjiData';
import type { BackupParseResult, StorageMutationResult } from '../types/kanji';

export const LS_KEY = 'n4kanji_mastered_v1';
export const HARD_KEY = 'n4kanji_hard_v1';
export const IRODORI_LS_KEY = 'irodori_mastered_v1';
export const IRODORI_HARD_KEY = 'irodori_hard_v1';
export const IRODORI_PEMULA_LS_KEY = 'irodori_pemula_mastered_v1';
export const IRODORI_PEMULA_HARD_KEY = 'irodori_pemula_hard_v1';
export const IRODORI_DASAR2_LS_KEY = 'irodori_dasar2_mastered_v1';
export const IRODORI_DASAR2_HARD_KEY = 'irodori_dasar2_hard_v1';
export const OWNER_UID_KEY = 'n4kanji_owner_uid_v1';
export const BACKUP_APP_ID = 'n4-kanji-kotoba';
export const BACKUP_SCHEMA_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function safeLoadSet(
  key: string,
  validIds: Set<string> = VALID_KANJI_IDS,
  storage: StorageLike | null = getDefaultStorage()
): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && validIds.has(id)));
  } catch {
    return new Set();
  }
}

export function getStoredOwnerUid(
  storage: StorageLike | null = getDefaultStorage()
): string | null {
  if (!storage) return null;
  try {
    const val = storage.getItem(OWNER_UID_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredOwnerUid(
  uid: string | null,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    if (uid) {
      storage.setItem(OWNER_UID_KEY, uid);
    } else {
      storage.removeItem(OWNER_UID_KEY);
    }
  } catch {
    // Ignore storage lock errors for non-critical metadata
  }
}

export function clearStoredProgress(
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(LS_KEY);
    storage.removeItem(HARD_KEY);
    storage.removeItem(OWNER_UID_KEY);
  } catch {
    // Ignore storage lock errors
  }
}

/**
 * Transactionally persists both mastered and hard sets to localStorage for any scoped key pair.
 */
export function commitScopedProgressTransaction(
  masteredKey: string,
  hardKey: string,
  nextMastered: Set<string>,
  nextHard: Set<string>,
  storage: StorageLike | null = getDefaultStorage()
): StorageMutationResult {
  if (!storage) {
    return {
      ok: false,
      error: 'Penyimpanan browser (localStorage) tidak tersedia atau diblokir.',
    };
  }

  let prevRawM: string | null = null;
  let prevRawH: string | null = null;

  try {
    prevRawM = storage.getItem(masteredKey);
    prevRawH = storage.getItem(hardKey);
  } catch {
    return {
      ok: false,
      error: 'Penyimpanan browser (localStorage) tidak dapat diakses.',
    };
  }

  try {
    const mJson = JSON.stringify([...nextMastered]);
    const hJson = JSON.stringify([...nextHard]);
    storage.setItem(masteredKey, mJson);
    storage.setItem(hardKey, hJson);

    const verifyM = storage.getItem(masteredKey);
    const verifyH = storage.getItem(hardKey);
    if (verifyM !== mJson || verifyH !== hJson) {
      throw new Error('Verification mismatch after write');
    }

    return { ok: true };
  } catch {
    try {
      if (prevRawM === null) storage.removeItem(masteredKey);
      else storage.setItem(masteredKey, prevRawM);
      if (prevRawH === null) storage.removeItem(hardKey);
      else storage.setItem(hardKey, prevRawH);
    } catch {
      // Ignore rollback errors if storage is completely locked
    }
    return {
      ok: false,
      error:
        'Gagal menyimpan ke penyimpanan browser (memori penuh atau diblokir). Progres sebelumnya tetap aman.',
    };
  }
}

/**
 * Transactionally persists both mastered and hard sets to localStorage.
 * If either write fails, rolls back to the previous stored values and returns ok: false
 * so the UI never reports a false success.
 */
export function commitProgressTransaction(
  nextMastered: Set<string>,
  nextHard: Set<string>,
  storage: StorageLike | null = getDefaultStorage()
): StorageMutationResult {
  return commitScopedProgressTransaction(LS_KEY, HARD_KEY, nextMastered, nextHard, storage);
}

function parseLegacyListField(rawField: unknown, fieldLabel: string): unknown[] {
  if (Array.isArray(rawField)) return rawField;
  if (typeof rawField === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawField);
    } catch {
      throw new Error(`Format data backup lama pada "${fieldLabel}" rusak.`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`Data backup lama pada "${fieldLabel}" harus berupa array.`);
    }
    return parsed;
  }
  throw new Error(`Struktur data backup lama pada "${fieldLabel}" tidak valid.`);
}

const ALLOWED_V1_KEYS = new Set(['app', 'version', 'exportedAt', 'mastered', 'hard']);
const ALLOWED_LEGACY_PLAIN_KEYS = new Set(['mastered', 'hard', 'exportedAt']);

export function validateAndParseBackup(
  rawText: string,
  validIds: Set<string> = VALID_KANJI_IDS
): BackupParseResult {
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('File bukan format JSON yang valid atau rusak.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Struktur JSON tidak valid (harus berupa objek backup).');
  }

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);

  const hasApp = Object.prototype.hasOwnProperty.call(obj, 'app');
  const hasVersion = Object.prototype.hasOwnProperty.call(obj, 'version');
  const hasModernMastered = Object.prototype.hasOwnProperty.call(obj, 'mastered');
  const hasModernHard = Object.prototype.hasOwnProperty.call(obj, 'hard');
  const hasLegacyMastered = Object.prototype.hasOwnProperty.call(obj, LS_KEY);
  const hasLegacyHard = Object.prototype.hasOwnProperty.call(obj, HARD_KEY);

  let rawMastered: unknown[] = [];
  let rawHard: unknown[] = [];
  let formatType: BackupParseResult['formatType'] = 'v1';

  if (hasApp || hasVersion) {
    if (obj.app !== BACKUP_APP_ID) {
      throw new Error(`Identitas aplikasi tidak cocok (app: "${String(obj.app ?? '')}").`);
    }
    if (obj.version !== BACKUP_SCHEMA_VERSION) {
      throw new Error(`Versi skema backup tidak didukung (version: ${String(obj.version ?? '')}).`);
    }
    if (!hasModernMastered || !hasModernHard) {
      throw new Error('File backup v1 harus memiliki array "mastered" dan "hard".');
    }
    if (!Array.isArray(obj.mastered)) {
      throw new Error('Struktur data "mastered" rusak (harus berupa array).');
    }
    if (!Array.isArray(obj.hard)) {
      throw new Error('Struktur data "hard" rusak (harus berupa array).');
    }
    if (obj.exportedAt !== undefined && typeof obj.exportedAt !== 'string') {
      throw new Error('Format field "exportedAt" tidak valid.');
    }
    for (const k of keys) {
      if (!ALLOWED_V1_KEYS.has(k)) {
        throw new Error(`Field tidak dikenali dalam file backup: "${k}".`);
      }
    }
    rawMastered = obj.mastered;
    rawHard = obj.hard;
    formatType = 'v1';
  } else if (hasLegacyMastered || hasLegacyHard) {
    rawMastered = hasLegacyMastered ? parseLegacyListField(obj[LS_KEY], LS_KEY) : [];
    rawHard = hasLegacyHard ? parseLegacyListField(obj[HARD_KEY], HARD_KEY) : [];
    formatType = 'legacy-storage';
  } else if (hasModernMastered && hasModernHard) {
    // Strict legacy-plain format: must have BOTH mastered & hard as arrays and no unrelated keys
    for (const k of keys) {
      if (!ALLOWED_LEGACY_PLAIN_KEYS.has(k)) {
        throw new Error('File JSON tidak dikenali sebagai backup N4 Kanji.');
      }
    }
    if (!Array.isArray(obj.mastered) || !Array.isArray(obj.hard)) {
      throw new Error('Struktur data "mastered" atau "hard" harus berupa array.');
    }
    rawMastered = obj.mastered;
    rawHard = obj.hard;
    formatType = 'legacy-plain';
  } else {
    throw new Error('File tidak memiliki struktur data backup kanji N4 yang valid.');
  }

  const impMasteredSet = new Set<string>();
  const impHardSet = new Set<string>();
  const rejectedSet = new Set<string>();

  const inspectList = (arr: unknown[], targetSet: Set<string>) => {
    for (const entry of arr) {
      if (typeof entry === 'string' && validIds.has(entry)) {
        targetSet.add(entry);
      } else {
        rejectedSet.add(typeof entry === 'string' ? entry : JSON.stringify(entry));
      }
    }
  };

  inspectList(rawMastered, impMasteredSet);
  inspectList(rawHard, impHardSet);

  const impMastered = [...impMasteredSet];
  const impHard = [...impHardSet];
  const rejectedIds = [...rejectedSet];

  // If a non-v1 legacy-plain file had entries but zero valid Kanji IDs, reject it as arbitrary JSON
  if (formatType === 'legacy-plain' && rejectedIds.length > 0 && impMastered.length === 0 && impHard.length === 0) {
    throw new Error('File tidak mengandung ID kanji N4 yang valid.');
  }

  return {
    formatType,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    impMastered,
    impHard,
    rejectedIds,
    isEmptyBackup: impMastered.length === 0 && impHard.length === 0,
  };
}

export function buildBackupPayload(mastered: Set<string>, hardSet: Set<string>) {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    mastered: [...mastered],
    hard: [...hardSet],
  };
}
