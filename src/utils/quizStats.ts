import type { LevelFilter, QuizSessionHistoryEntry, QuizTypeChoice } from '../types/kanji';
import { calculateQuizScore } from './quizEngine';
import type { StorageLike } from './storage';

export const QUIZ_HISTORY_KEY = 'n4kanji_quiz_history_v1';
export const IRODORI_QUIZ_HISTORY_KEY = 'irodori_quiz_history_v1';
export const IRODORI_PEMULA_QUIZ_HISTORY_KEY = 'irodori_pemula_quiz_history_v1';
export const IRODORI_DASAR2_QUIZ_HISTORY_KEY = 'irodori_dasar2_quiz_history_v1';
export const MAX_QUIZ_HISTORY = 15;

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
    return parsed.filter(isValidHistoryEntry).slice(0, MAX_QUIZ_HISTORY);
  } catch {
    return [];
  }
}

export function recordQuizSession(
  currentHistory: QuizSessionHistoryEntry[],
  input: {
    level: LevelFilter;
    scopeLabel?: string;
    mode: QuizTypeChoice;
    correct: number;
    total: number;
    completedAt?: string;
    id?: string;
  },
  storage: StorageLike | null = getDefaultStorage(),
  storageKey: string = QUIZ_HISTORY_KEY
): QuizSessionHistoryEntry[] {
  if (!Number.isInteger(input.total) || input.total <= 0) {
    return currentHistory;
  }
  const safeCorrect = Math.max(0, Math.min(input.total, Math.floor(input.correct)));
  const entry: QuizSessionHistoryEntry = {
    id: input.id ?? `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    completedAt: input.completedAt ?? new Date().toISOString(),
    level: VALID_LEVELS.has(input.level) ? input.level : 'all',
    ...(input.scopeLabel ? { scopeLabel: input.scopeLabel } : {}),
    mode: VALID_MODES.has(input.mode) ? input.mode : 'random',
    correct: safeCorrect,
    total: input.total,
    score: calculateQuizScore(safeCorrect, input.total),
  };

  const next = [entry, ...currentHistory].slice(0, MAX_QUIZ_HISTORY);
  if (storage) {
    try {
      storage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Non-fatal if storage quota is full; return in-memory updated list
    }
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
