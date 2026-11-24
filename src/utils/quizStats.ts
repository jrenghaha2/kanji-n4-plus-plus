import type {
  IrodoriChapterNumber,
  LevelFilter,
  QuizAnswerSnapshot,
  QuizDatasetId,
  QuizModelKey,
  QuizRecord,
  QuizSessionHistoryEntry,
  QuizTypeChoice,
} from '../types/kanji';
import { calculateQuizScore } from './quizEngine';
import type { StorageLike } from './storage';

export const QUIZ_HISTORY_KEY = 'n4kanji_quiz_history_v1';
export const IRODORI_QUIZ_HISTORY_KEY = 'irodori_quiz_history_v1';
export const IRODORI_PEMULA_QUIZ_HISTORY_KEY = 'irodori_pemula_quiz_history_v1';
export const IRODORI_DASAR2_QUIZ_HISTORY_KEY = 'irodori_dasar2_quiz_history_v1';
export const MAX_QUIZ_HISTORY = 15;
export const MAX_STORED_ANSWERS_PER_SESSION = 999;

export const QUIZ_HISTORY_KEYS_BY_DATASET: Record<QuizDatasetId, string> = {
  n4: QUIZ_HISTORY_KEY,
  pemula: IRODORI_PEMULA_QUIZ_HISTORY_KEY,
  dasar1: IRODORI_QUIZ_HISTORY_KEY,
  dasar2: IRODORI_DASAR2_QUIZ_HISTORY_KEY,
};

const VALID_LEVELS = new Set<LevelFilter>(['all', 'easy', 'medium', 'hard']);
const VALID_MODEL_KEYS = new Set<QuizModelKey>(['k2r', 'k2m', 'm2k', 'r2k', 'ex2k']);
const VALID_MODES = new Set<QuizTypeChoice>([
  'random',
  'random5',
  'k2r',
  'k2m',
  'm2k',
  'r2k',
  'ex2k',
]);

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

function sanitizeChapterNumbers(raw: unknown): IrodoriChapterNumber[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const set = new Set<IrodoriChapterNumber>();
  for (const ch of raw) {
    if (typeof ch === 'number' && Number.isInteger(ch) && ch >= 1 && ch <= 18) {
      set.add(ch as IrodoriChapterNumber);
    }
  }
  if (set.size === 0) return undefined;
  return [...set].sort((a, b) => a - b);
}

function isValidAnswerSnapshot(raw: unknown): raw is QuizAnswerSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.no === 'number' &&
    Number.isInteger(obj.no) &&
    obj.no >= 1 &&
    typeof obj.type === 'string' &&
    VALID_MODEL_KEYS.has(obj.type as QuizModelKey) &&
    typeof obj.correct === 'boolean' &&
    typeof obj.itemId === 'string' &&
    obj.itemId.length > 0 &&
    typeof obj.itemK === 'string' &&
    typeof obj.itemR === 'string' &&
    typeof obj.itemM === 'string' &&
    typeof obj.expectedLabel === 'string' &&
    typeof obj.chosenLabel === 'string'
  );
}

function sanitizeAnswerSnapshots(raw: unknown): QuizAnswerSnapshot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.filter(isValidAnswerSnapshot).map(ans => ({
    no: ans.no,
    type: ans.type,
    correct: ans.correct,
    itemId: ans.itemId,
    itemK: ans.itemK,
    itemR: ans.itemR,
    itemM: ans.itemM,
    expectedLabel: ans.expectedLabel,
    ...(typeof ans.chosenId === 'string' && ans.chosenId.length > 0
      ? { chosenId: ans.chosenId }
      : {}),
    chosenLabel: ans.chosenLabel,
    ...(typeof ans.chosenM === 'string' ? { chosenM: ans.chosenM } : {}),
    ...(typeof ans.ex === 'string' ? { ex: ans.ex } : {}),
  }));
  if (valid.length <= MAX_STORED_ANSWERS_PER_SESSION) {
    return valid.sort((a, b) => a.no - b.no);
  }
  // Keep all wrong answers first so learners never lose mistakes even on huge sessions
  const wrong = valid.filter(a => !a.correct).slice(0, MAX_STORED_ANSWERS_PER_SESSION);
  const remainingSlots = Math.max(0, MAX_STORED_ANSWERS_PER_SESSION - wrong.length);
  const right = valid.filter(a => a.correct).slice(0, remainingSlots);
  return [...wrong, ...right].sort((a, b) => a.no - b.no);
}

/**
 * Converts completed quiz records (`rightList` + `wrongList`) into compact,
 * serializable answer snapshots ordered by question number.
 */
export function buildQuizAnswerSnapshots(
  rightList: readonly QuizRecord[],
  wrongList: readonly QuizRecord[]
): QuizAnswerSnapshot[] {
  const toSnapshot = (rec: QuizRecord, correct: boolean): QuizAnswerSnapshot => {
    const expectedLabel =
      rec.type === 'k2r'
        ? rec.item.r
        : rec.type === 'k2m'
          ? rec.item.m
          : rec.type === 'ex2k'
            ? (rec.exMeta?.targetSurface ?? rec.item.k)
            : rec.item.k;
    return {
      no: rec.no,
      type: rec.type,
      correct,
      itemId: rec.item.id,
      itemK: rec.item.k,
      itemR: rec.item.r,
      itemM: rec.item.m,
      expectedLabel,
      chosenId: rec.chosen.id,
      chosenLabel: rec.chosenLabel,
      ...(rec.chosen.m && !correct ? { chosenM: rec.chosen.m } : {}),
      ...(rec.type === 'ex2k' && rec.item.ex ? { ex: rec.item.ex } : {}),
    };
  };

  const combined = [
    ...rightList.map(rec => toSnapshot(rec, true)),
    ...wrongList.map(rec => toSnapshot(rec, false)),
  ];
  return sanitizeAnswerSnapshots(combined) ?? [];
}

function isValidHistoryEntry(raw: unknown): raw is QuizSessionHistoryEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.completedAt === 'string' &&
    !Number.isNaN(Date.parse(obj.completedAt)) &&
    typeof obj.level === 'string' &&
    VALID_LEVELS.has(obj.level as LevelFilter) &&
    typeof obj.mode === 'string' &&
    VALID_MODES.has(obj.mode as QuizTypeChoice) &&
    typeof obj.correct === 'number' &&
    Number.isInteger(obj.correct) &&
    obj.correct >= 0 &&
    typeof obj.total === 'number' &&
    Number.isInteger(obj.total) &&
    obj.total > 0 &&
    obj.correct <= obj.total &&
    typeof obj.score === 'number' &&
    Number.isFinite(obj.score) &&
    obj.score >= 0 &&
    obj.score <= 100
  );
}

export function loadQuizHistory(
  storage: StorageLike | null = getDefaultStorage(),
  storageKey: string = QUIZ_HISTORY_KEY
): QuizSessionHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidHistoryEntry)
      .slice(0, MAX_QUIZ_HISTORY)
      .map(entry => {
        const sanitizedAnswers = sanitizeAnswerSnapshots(entry.answers);
        const sanitizedChapters = sanitizeChapterNumbers(entry.chapters);
        return {
          ...entry,
          ...(sanitizedChapters ? { chapters: sanitizedChapters } : {}),
          ...(sanitizedAnswers ? { answers: sanitizedAnswers } : {}),
        };
      });
  } catch {
    return [];
  }
}

function persistHistoryWithQuotaFallback(
  storage: StorageLike,
  storageKey: string,
  entries: QuizSessionHistoryEntry[]
): void {
  try {
    storage.setItem(storageKey, JSON.stringify(entries));
    return;
  } catch {
    // Quota tight: prune detailed answers from oldest sessions first while preserving scores
  }

  const trimmed = entries.map(e => ({ ...e }));
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i].answers) {
      delete trimmed[i].answers;
      try {
        storage.setItem(storageKey, JSON.stringify(trimmed));
        return;
      } catch {
        // Keep trimming older snapshots until it fits
      }
    }
  }
}

export function saveQuizHistory(
  entries: QuizSessionHistoryEntry[],
  storage: StorageLike | null = getDefaultStorage(),
  storageKey: string = QUIZ_HISTORY_KEY
): QuizSessionHistoryEntry[] {
  const capped = entries.slice(0, MAX_QUIZ_HISTORY);
  if (storage) {
    if (capped.length === 0) {
      try {
        storage.removeItem(storageKey);
      } catch {
        // Ignore storage lock errors
      }
    } else {
      persistHistoryWithQuotaFallback(storage, storageKey, capped);
    }
  }
  return capped;
}

export function recordQuizSession(
  currentHistory: QuizSessionHistoryEntry[],
  input: {
    level: LevelFilter;
    scopeLabel?: string;
    chapters?: IrodoriChapterNumber[];
    mode: QuizTypeChoice;
    correct: number;
    total: number;
    completedAt?: string;
    id?: string;
    answers?: QuizAnswerSnapshot[];
  },
  storage: StorageLike | null = getDefaultStorage(),
  storageKey: string = QUIZ_HISTORY_KEY
): QuizSessionHistoryEntry[] {
  if (!Number.isInteger(input.total) || input.total <= 0) {
    return currentHistory;
  }
  const safeCorrect = Math.max(0, Math.min(input.total, Math.floor(input.correct)));
  const sanitizedAnswers = input.answers ? sanitizeAnswerSnapshots(input.answers) : undefined;
  const sanitizedChapters = sanitizeChapterNumbers(input.chapters);
  const entry: QuizSessionHistoryEntry = {
    id: input.id ?? `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    completedAt: input.completedAt ?? new Date().toISOString(),
    level: VALID_LEVELS.has(input.level) ? input.level : 'all',
    ...(input.scopeLabel ? { scopeLabel: input.scopeLabel } : {}),
    ...(sanitizedChapters ? { chapters: sanitizedChapters } : {}),
    mode: VALID_MODES.has(input.mode) ? input.mode : 'random',
    correct: safeCorrect,
    total: input.total,
    score: calculateQuizScore(safeCorrect, input.total),
    ...(sanitizedAnswers && sanitizedAnswers.length > 0 ? { answers: sanitizedAnswers } : {}),
  };

  const next = [entry, ...currentHistory].slice(0, MAX_QUIZ_HISTORY);
  if (storage) {
    persistHistoryWithQuotaFallback(storage, storageKey, next);
  }
  return next;
}

export function clearQuizHistory(
  storage: StorageLike | null = getDefaultStorage(),
  storageKey: string = QUIZ_HISTORY_KEY
): QuizSessionHistoryEntry[] {
  if (storage) {
    try {
      storage.removeItem(storageKey);
    } catch {
      // Ignore storage lock errors
    }
  }
  return [];
}

export interface QuizPerformanceStats {
  totalSessions: number;
  totalCorrect: number;
  totalAnswered: number;
  overallAccuracyPct: number;
  bestScore: number;
  latestScore: number | null;
  trendDelta: number | null;
}

export function computeQuizPerformanceStats(
  history: QuizSessionHistoryEntry[]
): QuizPerformanceStats {
  if (history.length === 0) {
    return {
      totalSessions: 0,
      totalCorrect: 0,
      totalAnswered: 0,
      overallAccuracyPct: 0,
      bestScore: 0,
      latestScore: null,
      trendDelta: null,
    };
  }

  let totalCorrect = 0;
  let totalAnswered = 0;
  let bestScore = 0;

  for (const item of history) {
    totalCorrect += item.correct;
    totalAnswered += item.total;
    if (item.score > bestScore) {
      bestScore = item.score;
    }
  }

  const overallAccuracyPct =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const latestScore = history[0].score;
  const trendDelta = history.length >= 2 ? history[0].score - history[1].score : null;

  return {
    totalSessions: history.length,
    totalCorrect,
    totalAnswered,
    overallAccuracyPct,
    bestScore,
    latestScore,
    trendDelta,
  };
}
