import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { IRODORI_CHAPTER_NUMBERS } from '../data/irodoriShared';
import { KANJI, LEVELS } from '../data/kanjiData';
import type {
  IrodoriChapterNumber,
  KanjiEntry,
  LevelFilter,
  QuizAnswerSnapshot,
  QuizDatasetId,
  QuizModelKey,
  QuizSessionHistoryEntry,
  QuizTypeChoice,
} from '../types/kanji';
import { analyzeSentenceBlank } from './morphology';
import { isValidFirebaseUid } from './progressSync';
import { calculateQuizScore, dispOf, formatChapterSelectionLabel } from './quizEngine';
import { MAX_QUIZ_HISTORY } from './quizStats';

// Volumetric & regex boundaries synchronized verbatim with firebase-blueprint.json & firestore.rules
export const QUIZ_DATASET_IDS: readonly QuizDatasetId[] = [
  'n4',
  'pemula',
  'dasar1',
  'dasar2',
] as const;

export const MAX_CLOUD_QUIZ_SESSIONS = MAX_QUIZ_HISTORY; // 15
export const MAX_CLOUD_QUIZ_SESSION_TOKEN_LENGTH = 12000;
export const MAX_CLOUD_QUIZ_JOINED_LENGTH = 160000;
export const MAX_CLOUD_SESSION_ID_LENGTH = 48;

const QUIZ_SESSION_TOKEN_BODY =
  '[a-zA-Z0-9_\\-]+\\|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,3})?Z\\|(all|easy|medium|hard)\\|(random|random5|k2r|k2m|m2k|r2k|ex2k)\\|[0-9]{1,3}\\|[1-9][0-9]{0,2}\\|(100|[0-9]{1,2})\\|(|all|[1-9][0-9]?(\\.[1-9][0-9]?)*)\\|(|[1-9][0-9]{0,2}:[0-9]:(n|irp|ir|ir2_)[1-9][0-9]{0,3}(:(n|irp|ir|ir2_)[1-9][0-9]{0,3})?(;[1-9][0-9]{0,2}:[0-9]:(n|irp|ir|ir2_)[1-9][0-9]{0,3}(:(n|irp|ir|ir2_)[1-9][0-9]{0,3})?)*)';

export const QUIZ_SESSION_TOKEN_PATTERN = new RegExp(`^${QUIZ_SESSION_TOKEN_BODY}$`);
export const QUIZ_SESSION_COMMA_JOINED_PATTERN = new RegExp(
  `^${QUIZ_SESSION_TOKEN_BODY}(,${QUIZ_SESSION_TOKEN_BODY})*$`
);
export const QUIZ_SESSION_TILDE_JOINED_PATTERN = new RegExp(
  `^${QUIZ_SESSION_TOKEN_BODY}(~${QUIZ_SESSION_TOKEN_BODY})*$`
);

const MODEL_ORDER: readonly QuizModelKey[] = ['k2r', 'k2m', 'm2k', 'r2k', 'ex2k'] as const;
const MODEL_TO_INDEX: Record<QuizModelKey, number> = {
  k2r: 0,
  k2m: 1,
  m2k: 2,
  r2k: 3,
  ex2k: 4,
};

const VALID_LEVELS = new Set<LevelFilter>(['all', 'easy', 'medium', 'hard']);
const VALID_MODES = new Set<QuizTypeChoice>([
  'random',
  'random5',
  'k2r',
  'k2m',
  'm2k',
  'r2k',
  'ex2k',
]);

const datasetMapCache = new Map<QuizDatasetId, ReadonlyMap<string, KanjiEntry>>();

export interface QuizHistorySyncPayload {
  uid: string;
  datasetId: QuizDatasetId;
  sessions: string[];
}

export function isValidQuizDatasetId(raw: unknown): raw is QuizDatasetId {
  return raw === 'n4' || raw === 'pemula' || raw === 'dasar1' || raw === 'dasar2';
}

export function getQuizDatasetEntries(datasetId: QuizDatasetId): readonly KanjiEntry[] {
  if (datasetId === 'n4') return KANJI;
  return IRODORI_BOOKS[datasetId].data;
}

export function getQuizDatasetMap(datasetId: QuizDatasetId): ReadonlyMap<string, KanjiEntry> {
  const cached = datasetMapCache.get(datasetId);
  if (cached) return cached;
  const map = new Map<string, KanjiEntry>();
  for (const entry of getQuizDatasetEntries(datasetId)) {
    map.set(entry.id, entry);
  }
  datasetMapCache.set(datasetId, map);
  return map;
}

function sanitizeSessionId(rawId: string, fallbackSeed: number): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_CLOUD_SESSION_ID_LENGTH);
  return cleaned.length > 0 ? cleaned : `q-${fallbackSeed}`;
}

function normalizeIsoTimestamp(raw: string): string {
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return new Date(0).toISOString();
  return new Date(ms).toISOString();
}

/**
 * Extracts compact chapter scope code for Irodori sessions (`all` or dot-separated chapters `1.2.5`).
 * Supports both structured `entry.chapters` and legacy `entry.scopeLabel` strings like `"Bab 1–3, 5"`.
 */
function encodeScopeCode(entry: QuizSessionHistoryEntry, datasetId: QuizDatasetId): string {
  if (datasetId === 'n4') return '';

  if (entry.chapters && entry.chapters.length > 0) {
    const unique = [...new Set(entry.chapters)]
      .filter(ch => Number.isInteger(ch) && ch >= 1 && ch <= 18)
      .sort((a, b) => a - b);
    if (unique.length >= IRODORI_CHAPTER_NUMBERS.length) return 'all';
    if (unique.length > 0) return unique.join('.');
  }

  const label = entry.scopeLabel?.trim();
  if (!label) return '';
  if (label.startsWith('Semua Bab')) return 'all';

  // Parse legacy ranges such as "Bab 3" or "Bab 1–3, 5, 8–9"
  const rangeBody = label.replace(/^Bab\s+/i, '');
  if (/^\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*$/.test(rangeBody)) {
    const chapters = new Set<number>();
    for (const part of rangeBody.split(',')) {
      const m = part.trim().match(/^(\d+)(?:\s*[–-]\s*(\d+))?$/);
      if (!m) continue;
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : start;
      for (let c = Math.max(1, start); c <= Math.min(18, end); c++) {
        chapters.add(c);
      }
    }
    const sorted = [...chapters].sort((a, b) => a - b);
    if (sorted.length >= IRODORI_CHAPTER_NUMBERS.length) return 'all';
    if (sorted.length > 0) return sorted.join('.');
  }

  return '';
}

function decodeScopeCode(
  scopeCode: string,
  level: LevelFilter,
  datasetId: QuizDatasetId
): { scopeLabel: string; chapters?: IrodoriChapterNumber[] } {
  if (datasetId === 'n4') {
    return { scopeLabel: `Level ${LEVELS[level].label}` };
  }
  if (scopeCode === 'all') {
    const chapters = [...IRODORI_CHAPTER_NUMBERS];
    return {
      scopeLabel: formatChapterSelectionLabel(chapters, IRODORI_CHAPTER_NUMBERS.length),
      chapters,
    };
  }
  if (scopeCode.length > 0) {
    const unique = new Set<IrodoriChapterNumber>();
    for (const part of scopeCode.split('.')) {
      const n = Number(part);
      if (Number.isInteger(n) && n >= 1 && n <= 18) {
        unique.add(n as IrodoriChapterNumber);
      }
    }
    const chapters = [...unique].sort((a, b) => a - b);
    if (chapters.length > 0) {
      return {
        scopeLabel: formatChapterSelectionLabel(chapters, IRODORI_CHAPTER_NUMBERS.length),
        chapters,
      };
    }
  }
  return { scopeLabel: `Level ${LEVELS[level].label}` };
}

/**
 * Fallback reverse lookup for legacy local wrong-answer snapshots that predate `chosenId`.
 */
function inferChosenIdForLegacySnapshot(
  ans: QuizAnswerSnapshot,
  datasetId: QuizDatasetId
): string | null {
  const entries = getQuizDatasetEntries(datasetId);
  for (const item of entries) {
    if (item.id === ans.itemId) continue;
    if (ans.type === 'k2r' && item.r === ans.chosenLabel && (!ans.chosenM || item.m === ans.chosenM)) {
      return item.id;
    }
    if (ans.type === 'k2m' && item.m === ans.chosenLabel) {
      return item.id;
    }
    if (
      (ans.type === 'm2k' || ans.type === 'r2k') &&
      item.k === ans.chosenLabel &&
      (!ans.chosenM || item.m === ans.chosenM)
    ) {
      return item.id;
    }
    if (ans.type === 'ex2k' && ans.chosenM && item.m === ans.chosenM) {
      return item.id;
    }
  }
  return null;
}

function packAnswerTokens(
  answers: readonly QuizAnswerSnapshot[] | undefined,
  datasetId: QuizDatasetId,
  maxBytes: number
): string {
  if (!answers || answers.length === 0 || maxBytes <= 0) return '';

  const byId = getQuizDatasetMap(datasetId);
  const encodedRows: { no: number; correct: boolean; token: string }[] = [];

  for (const ans of answers) {
    if (!Number.isInteger(ans.no) || ans.no < 1 || ans.no > 500) continue;
    if (!byId.has(ans.itemId)) continue;
    const typeIdx = MODEL_TO_INDEX[ans.type];
    if (typeIdx === undefined) continue;

    // 0..4 = wrong (k2r..ex2k), 5..9 = correct (k2r..ex2k)
    const code = typeIdx + (ans.correct ? 5 : 0);
    if (ans.correct) {
      encodedRows.push({
        no: ans.no,
        correct: true,
        token: `${ans.no}:${code}:${ans.itemId}`,
      });
    } else {
      const resolvedChosenId =
        ans.chosenId && byId.has(ans.chosenId)
          ? ans.chosenId
          : inferChosenIdForLegacySnapshot(ans, datasetId);
      const token = resolvedChosenId
        ? `${ans.no}:${code}:${ans.itemId}:${resolvedChosenId}`
        : `${ans.no}:${code}:${ans.itemId}`;
      encodedRows.push({
        no: ans.no,
        correct: false,
        token,
      });
    }
  }

  if (encodedRows.length === 0) return '';

  encodedRows.sort((a, b) => a.no - b.no);
  const fullJoined = encodedRows.map(r => r.token).join(';');
  if (fullJoined.length <= maxBytes) return fullJoined;

  // Prioritize preserving ALL wrong answers first if a huge session ever approaches the per-token byte ceiling
  const selected: typeof encodedRows = [];
  let usedBytes = 0;

  const tryAdd = (row: (typeof encodedRows)[number]) => {
    const needed = row.token.length + (selected.length > 0 ? 1 : 0);
    if (usedBytes + needed <= maxBytes) {
      selected.push(row);
      usedBytes += needed;
    }
  };

  for (const row of encodedRows) {
    if (!row.correct) tryAdd(row);
  }
  for (const row of encodedRows) {
    if (row.correct) tryAdd(row);
  }

  selected.sort((a, b) => a.no - b.no);
  return selected.map(r => r.token).join(';');
}

/**
 * Encodes one quiz session into an ultra-compact pure-ASCII ID-reference token
 * (~1 KB for a 100-question session, >90% smaller than raw text snapshots).
 */
export function encodeQuizSessionCompact(
  entry: QuizSessionHistoryEntry,
  datasetId: QuizDatasetId,
  includeAnswers = true
): string | null {
  if (!Number.isInteger(entry.total) || entry.total <= 0) return null;
  const total = Math.min(500, entry.total);
  const correct = Math.max(0, Math.min(total, Math.floor(entry.correct)));
  const score = calculateQuizScore(correct, total);
  const level: LevelFilter = VALID_LEVELS.has(entry.level) ? entry.level : 'all';
  const mode: QuizTypeChoice = VALID_MODES.has(entry.mode) ? entry.mode : 'random';
  const completedAt = normalizeIsoTimestamp(entry.completedAt);
  const id = sanitizeSessionId(entry.id, Date.parse(completedAt) || Date.now());
  const scopeCode = encodeScopeCode(entry, datasetId);

  const headerPrefix = `${id}|${completedAt}|${level}|${mode}|${correct}|${total}|${score}|${scopeCode}|`;
  const maxAnswerBytes = Math.max(0, MAX_CLOUD_QUIZ_SESSION_TOKEN_LENGTH - headerPrefix.length);
  const answersPacked = includeAnswers
    ? packAnswerTokens(entry.answers, datasetId, maxAnswerBytes)
    : '';

  const token = `${headerPrefix}${answersPacked}`;
  if (
    token.length < 25 ||
    token.length > MAX_CLOUD_QUIZ_SESSION_TOKEN_LENGTH ||
    !QUIZ_SESSION_TOKEN_PATTERN.test(token)
  ) {
    return null;
  }
  return token;
}

/**
 * Decodes a compact cloud session token and deterministically hydrates full Kanji/Irodori
 * details (including conjugated `ex2k` sentence surfaces) from static bundled dictionaries.
 */
export function decodeQuizSessionCompact(
  token: string,
  datasetId: QuizDatasetId
): QuizSessionHistoryEntry | null {
  if (
    typeof token !== 'string' ||
    token.length < 25 ||
    token.length > MAX_CLOUD_QUIZ_SESSION_TOKEN_LENGTH ||
    !QUIZ_SESSION_TOKEN_PATTERN.test(token)
  ) {
    return null;
  }

  const parts = token.split('|');
  if (parts.length !== 9) return null;

  const [id, completedAt, rawLevel, rawMode, rawCorrect, rawTotal, rawScore, scopeCode, answersPacked] =
    parts;

  const level = rawLevel as LevelFilter;
  const mode = rawMode as QuizTypeChoice;
  const total = Number(rawTotal);
  const correct = Number(rawCorrect);
  const score = Number(rawScore);

  if (
    !VALID_LEVELS.has(level) ||
    !VALID_MODES.has(mode) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    total > 500 ||
    !Number.isInteger(correct) ||
    correct < 0 ||
    correct > total ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100 ||
    Number.isNaN(Date.parse(completedAt))
  ) {
    return null;
  }

  const { scopeLabel, chapters } = decodeScopeCode(scopeCode, level, datasetId);
  const byId = getQuizDatasetMap(datasetId);
  const answers: QuizAnswerSnapshot[] = [];

  if (answersPacked.length > 0) {
    for (const rawRow of answersPacked.split(';')) {
      const cols = rawRow.split(':');
      if (cols.length < 3 || cols.length > 4) continue;
      const no = Number(cols[0]);
      const code = Number(cols[1]);
      const itemId = cols[2];
      const rawChosenId = cols[3];

      if (!Number.isInteger(no) || no < 1 || !Number.isInteger(code) || code < 0 || code > 9) {
        continue;
      }

      const type = MODEL_ORDER[code % 5];
      const isCorrect = code >= 5;
      const item = byId.get(itemId);
      if (!item || !type) continue;

      const exMeta = type === 'ex2k' ? analyzeSentenceBlank(item) : null;
      const expectedLabel =
        type === 'ex2k' ? (exMeta?.targetSurface ?? item.k) : dispOf(item, type, null);

      const chosenItem = isCorrect ? item : rawChosenId ? byId.get(rawChosenId) : undefined;
      const chosenLabel = chosenItem
        ? dispOf(chosenItem, type, exMeta)
        : isCorrect
          ? expectedLabel
          : '—';

      answers.push({
        no,
        type,
        correct: isCorrect,
        itemId: item.id,
        itemK: item.k,
        itemR: item.r,
        itemM: item.m,
        expectedLabel,
        ...(chosenItem ? { chosenId: chosenItem.id } : {}),
        chosenLabel,
        ...(!isCorrect && chosenItem?.m ? { chosenM: chosenItem.m } : {}),
        ...(type === 'ex2k' && item.ex ? { ex: item.ex } : {}),
      });
    }
    answers.sort((a, b) => a.no - b.no);
  }

  return {
    id,
    completedAt,
    level,
    scopeLabel,
    ...(chapters ? { chapters } : {}),
    mode,
    correct,
    total,
    score,
    ...(answers.length > 0 ? { answers } : {}),
  };
}

/**
 * Builds a validated Firestore payload for `/users/{uid}/quizHistory/{datasetId}`
 * strictly conforming to `firebase-blueprint.json` and `firestore.rules`.
 */
export function buildQuizHistoryWriteData(
  uid: string,
  datasetId: QuizDatasetId,
  entries: readonly QuizSessionHistoryEntry[]
): QuizHistorySyncPayload {
  if (!isValidFirebaseUid(uid)) {
    throw new Error('UID pengguna tidak valid untuk sinkronisasi riwayat kuis.');
  }
  if (!isValidQuizDatasetId(datasetId)) {
    throw new Error('Identitas dataset kuis tidak valid untuk sinkronisasi Firestore.');
  }

  const deduped: QuizSessionHistoryEntry[] = [];
  const seenIds = new Set<string>();
  const sorted = [...entries].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));

  for (const entry of sorted) {
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    deduped.push(entry);
    if (deduped.length >= MAX_CLOUD_QUIZ_SESSIONS) break;
  }

  const encodeAll = (dropAnswersFromIndex: number): string[] => {
    const tokens: string[] = [];
    const seenTokens = new Set<string>();
    for (let i = 0; i < deduped.length; i++) {
      const token = encodeQuizSessionCompact(deduped[i], datasetId, i < dropAnswersFromIndex);
      if (token && !seenTokens.has(token)) {
        seenTokens.add(token);
        tokens.push(token);
      }
    }
    return tokens;
  };

  let sessions = encodeAll(deduped.length);
  // Defensive boundary guarantee: if total joined size ever exceeds 160 KB, trim oldest session answers first
  for (
    let keepAnswersCount = deduped.length - 1;
    keepAnswersCount >= 0 && sessions.join(',').length > MAX_CLOUD_QUIZ_JOINED_LENGTH;
    keepAnswersCount--
  ) {
    sessions = encodeAll(keepAnswersCount);
  }

  return {
    uid,
    datasetId,
    sessions,
  };
}

export function decodeQuizHistoryFromCloud(
  rawSessions: unknown,
  datasetId: QuizDatasetId
): QuizSessionHistoryEntry[] {
  if (!Array.isArray(rawSessions)) return [];
  const seenIds = new Set<string>();
  const decoded: QuizSessionHistoryEntry[] = [];

  for (const raw of rawSessions) {
    if (typeof raw !== 'string') continue;
    const entry = decodeQuizSessionCompact(raw, datasetId);
    if (!entry || seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    decoded.push(entry);
    if (decoded.length >= MAX_CLOUD_QUIZ_SESSIONS) break;
  }

  decoded.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  return decoded;
}

/**
 * Merges cloud and local quiz histories by session ID (newest first, capped at 15),
 * preserving whichever copy holds richer answer snapshots.
 */
export function mergeQuizHistories(
  cloudEntries: readonly QuizSessionHistoryEntry[],
  localEntries: readonly QuizSessionHistoryEntry[]
): {
  merged: QuizSessionHistoryEntry[];
  needsCloudWrite: boolean;
  addedFromLocal: number;
} {
  const byId = new Map<string, QuizSessionHistoryEntry>();
  const cloudIds = new Set<string>();

  for (const entry of cloudEntries) {
    byId.set(entry.id, entry);
    cloudIds.add(entry.id);
  }

  let addedFromLocal = 0;
  let enrichedFromLocal = false;

  for (const local of localEntries) {
    const existing = byId.get(local.id);
    if (!existing) {
      byId.set(local.id, local);
      addedFromLocal += 1;
    } else if ((local.answers?.length ?? 0) > (existing.answers?.length ?? 0)) {
      byId.set(local.id, local);
      enrichedFromLocal = true;
    }
  }

  const merged = [...byId.values()]
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, MAX_QUIZ_HISTORY);

  // Cloud only needs a write if at least one newly added/enriched local session survived the top-15 cap
  const mergedIncludesLocalChange =
    enrichedFromLocal || merged.some(entry => !cloudIds.has(entry.id));

  return {
    merged,
    needsCloudWrite: mergedIncludesLocalChange,
    addedFromLocal,
  };
}

export function areQuizHistoriesEqual(
  a: readonly QuizSessionHistoryEntry[],
  b: readonly QuizSessionHistoryEntry[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].completedAt !== b[i].completedAt ||
      a[i].correct !== b[i].correct ||
      a[i].total !== b[i].total ||
      a[i].score !== b[i].score ||
      (a[i].answers?.length ?? 0) !== (b[i].answers?.length ?? 0)
    ) {
      return false;
    }
  }
  return true;
}
