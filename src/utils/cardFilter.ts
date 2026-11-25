import type { CardStatusCategory, CardStatusSelection, KanjiEntry } from '../types/kanji';

export const ALL_CARD_STATUS_CATEGORIES: readonly CardStatusCategory[] = [
  'unmarked',
  'mastered',
  'hard',
] as const;

export const CARD_STATUS_LABELS: Record<CardStatusCategory, string> = {
  unmarked: 'Belum ditandai',
  mastered: 'Sudah hafal',
  hard: 'Sulit',
};

export interface CardStatusCounts {
  all: number;
  unmarked: number;
  mastered: number;
  hard: number;
}

/**
 * Classifies an item into one of 3 strictly disjoint status buckets:
 * - 'mastered': marked as hafal
 * - 'hard': marked as sulit (separated from unmarked)
 * - 'unmarked': neither mastered nor hard (belum ditandai apapun)
 */
export function getItemStatusCategory(
  id: string,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): CardStatusCategory {
  if (mastered.has(id)) return 'mastered';
  if (hardSet.has(id)) return 'hard';
  return 'unmarked';
}

/**
 * Multi-select toggle state machine for status categories:
 * - Empty array [] represents "Semua" (all categories).
 * - Clicking a category while in "Semua" selects only that category.
 * - Clicking another category adds it (multi-select).
 * - Clicking an already-selected category removes it.
 * - Selecting all 3 categories or deselecting the last remaining one normalizes to [] ("Semua").
 */
export function toggleCardStatusSelection(
  current: CardStatusSelection,
  category: CardStatusCategory
): CardStatusCategory[] {
  if (current.length === 0) {
    return [category];
  }

  const nextSet = new Set<CardStatusCategory>(current);
  if (nextSet.has(category)) {
    nextSet.delete(category);
  } else {
    nextSet.add(category);
  }

  if (nextSet.size === 0 || nextSet.size === ALL_CARD_STATUS_CATEGORIES.length) {
    return [];
  }

  return ALL_CARD_STATUS_CATEGORIES.filter(cat => nextSet.has(cat));
}

export function formatSelectedStatusesLabel(selectedStatuses: CardStatusSelection): string {
  if (selectedStatuses.length === 0) return 'Semua';
  return selectedStatuses.map(cat => CARD_STATUS_LABELS[cat]).join(' + ');
}

export function matchesCardStatuses(
  id: string,
  selectedStatuses: CardStatusSelection,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): boolean {
  if (selectedStatuses.length === 0) return true;
  const cat = getItemStatusCategory(id, mastered, hardSet);
  return selectedStatuses.includes(cat);
}

export function filterCardIndices(
  poolIndices: readonly number[],
  dataset: readonly KanjiEntry[],
  selectedStatuses: CardStatusSelection,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): number[] {
  if (selectedStatuses.length === 0) return poolIndices.slice();
  return poolIndices.filter(idx => {
    const item = dataset[idx];
    if (!item) return false;
    return matchesCardStatuses(item.id, selectedStatuses, mastered, hardSet);
  });
}

export function filterCardItems(
  items: readonly KanjiEntry[],
  selectedStatuses: CardStatusSelection,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): KanjiEntry[] {
  if (selectedStatuses.length === 0) return items.slice();
  return items.filter(item =>
    matchesCardStatuses(item.id, selectedStatuses, mastered, hardSet)
  );
}

export function countCardStatuses(
  poolIndices: readonly number[],
  dataset: readonly KanjiEntry[],
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): CardStatusCounts {
  let unmarked = 0;
  let masteredCount = 0;
  let hardCount = 0;

  for (const idx of poolIndices) {
    const item = dataset[idx];
    if (!item) continue;
    const cat = getItemStatusCategory(item.id, mastered, hardSet);
    if (cat === 'mastered') masteredCount++;
    else if (cat === 'hard') hardCount++;
    else unmarked++;
  }

  return {
    all: unmarked + masteredCount + hardCount,
    unmarked,
    mastered: masteredCount,
    hard: hardCount,
  };
}

export function countItemStatuses(
  items: readonly KanjiEntry[],
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): CardStatusCounts {
  let unmarked = 0;
  let masteredCount = 0;
  let hardCount = 0;

  for (const item of items) {
    const cat = getItemStatusCategory(item.id, mastered, hardSet);
    if (cat === 'mastered') masteredCount++;
    else if (cat === 'hard') hardCount++;
    else unmarked++;
  }

  return {
    all: unmarked + masteredCount + hardCount,
    unmarked,
    mastered: masteredCount,
    hard: hardCount,
  };
}

export function shuffleItems<T>(
  items: readonly T[],
  rng: () => number = Math.random
): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function isSameSequence<T>(
  a: readonly T[],
  b: readonly T[],
  getKey?: (item: T) => string | number
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ka = getKey ? getKey(a[i]) : a[i];
    const kb = getKey ? getKey(b[i]) : b[i];
    if (ka !== kb) return false;
  }
  return true;
}

/**
 * Shuffles items and guarantees a different sequence when there are >= 2 distinct
 * elements and a previous sequence is provided (avoids dead-click feeling on 2-card decks).
 */
export function reshuffleDifferent<T>(
  items: readonly T[],
  previousOrder?: readonly T[],
  getKey?: (item: T) => string | number,
  rng: () => number = Math.random
): T[] {
  if (items.length <= 1) return items.slice();

  let candidate = shuffleItems(items, rng);
  if (!previousOrder || previousOrder.length !== items.length) {
    return candidate;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!isSameSequence(candidate, previousOrder, getKey)) {
      return candidate;
    }
    candidate = shuffleItems(items, rng);
  }

  if (isSameSequence(candidate, previousOrder, getKey)) {
    const firstKey = getKey ? getKey(candidate[0]) : candidate[0];
    const swapIdx = candidate.findIndex(
      el => (getKey ? getKey(el) : el) !== firstKey
    );
    if (swapIdx > 0) {
      const tmp = candidate[0];
      candidate[0] = candidate[swapIdx];
      candidate[swapIdx] = tmp;
    }
  }
  return candidate;
}

export function buildCardOrder(
  poolIndices: readonly number[],
  dataset: readonly KanjiEntry[],
  selectedStatuses: CardStatusSelection,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>,
  shuffleOn: boolean,
  rng: () => number = Math.random
): number[] {
  const filtered = filterCardIndices(
    poolIndices,
    dataset,
    selectedStatuses,
    mastered,
    hardSet
  );
  return shuffleOn ? shuffleItems(filtered, rng) : filtered;
}
