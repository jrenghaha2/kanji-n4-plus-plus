import type { CardStatusFilter, KanjiEntry } from '../types/kanji';

export interface CardStatusCounts {
  all: number;
  unmastered: number;
  mastered: number;
  hard: number;
}

export function matchesCardStatus(
  id: string,
  statusFilter: CardStatusFilter,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): boolean {
  switch (statusFilter) {
    case 'all':
      return true;
    case 'unmastered':
      return !mastered.has(id);
    case 'mastered':
      return mastered.has(id);
    case 'hard':
      return hardSet.has(id);
  }
}

export function filterCardIndices(
  poolIndices: readonly number[],
  dataset: readonly KanjiEntry[],
  statusFilter: CardStatusFilter,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): number[] {
  if (statusFilter === 'all') return poolIndices.slice();
  return poolIndices.filter(idx => {
    const item = dataset[idx];
    if (!item) return false;
    return matchesCardStatus(item.id, statusFilter, mastered, hardSet);
  });
}

export function filterCardItems(
  items: readonly KanjiEntry[],
  statusFilter: CardStatusFilter,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): KanjiEntry[] {
  if (statusFilter === 'all') return items.slice();
  return items.filter(item => matchesCardStatus(item.id, statusFilter, mastered, hardSet));
}

export function countCardStatuses(
  poolIndices: readonly number[],
  dataset: readonly KanjiEntry[],
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): CardStatusCounts {
  let masteredCount = 0;
  let hardCount = 0;
  let validTotal = 0;

  for (const idx of poolIndices) {
    const item = dataset[idx];
    if (!item) continue;
    validTotal++;
    if (mastered.has(item.id)) masteredCount++;
    if (hardSet.has(item.id)) hardCount++;
  }

  return {
    all: validTotal,
    unmastered: validTotal - masteredCount,
    mastered: masteredCount,
    hard: hardCount,
  };
}

export function countItemStatuses(
  items: readonly KanjiEntry[],
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>
): CardStatusCounts {
  let masteredCount = 0;
  let hardCount = 0;

  for (const item of items) {
    if (mastered.has(item.id)) masteredCount++;
    if (hardSet.has(item.id)) hardCount++;
  }

  return {
    all: items.length,
    unmastered: items.length - masteredCount,
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
  statusFilter: CardStatusFilter,
  mastered: ReadonlySet<string>,
  hardSet: ReadonlySet<string>,
  shuffleOn: boolean,
  rng: () => number = Math.random
): number[] {
  const filtered = filterCardIndices(poolIndices, dataset, statusFilter, mastered, hardSet);
  return shuffleOn ? shuffleItems(filtered, rng) : filtered;
}
