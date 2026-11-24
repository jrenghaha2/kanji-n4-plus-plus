import test from 'node:test';
import assert from 'node:assert/strict';
import type { KanjiEntry } from '../types/kanji';
import {
  buildCardOrder,
  countCardStatuses,
  countItemStatuses,
  filterCardIndices,
  filterCardItems,
  matchesCardStatus,
  reshuffleDifferent,
  shuffleItems,
} from './cardFilter';

const SAMPLE_DATASET: KanjiEntry[] = [
  { id: 'n1', k: '一', r: 'いち', m: 'satu', ex: '一つ', exi: 'satu buah', lv: 'N4', dif: 'easy' },
  { id: 'n2', k: '二', r: 'に', m: 'dua', ex: '二つ', exi: 'dua buah', lv: 'N4', dif: 'easy' },
  { id: 'n3', k: '三', r: 'さん', m: 'tiga', ex: '三つ', exi: 'tiga buah', lv: 'N4', dif: 'medium' },
  { id: 'n4', k: '四', r: 'よん', m: 'empat', ex: '四つ', exi: 'empat buah', lv: 'N4', dif: 'medium' },
  { id: 'n5', k: '五', r: 'ご', m: 'lima', ex: '五つ', exi: 'lima buah', lv: 'N4', dif: 'hard' },
  { id: 'n6', k: '六', r: 'ろく', m: 'enam', ex: '六つ', exi: 'enam buah', lv: 'N4', dif: 'hard' },
];

const ALL_INDICES = [0, 1, 2, 3, 4, 5];

function makeSeqRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

test('matchesCardStatus handles all 4 modes accurately', () => {
  const mastered = new Set(['n1', 'n2']);
  const hardSet = new Set(['n3', 'n5']);

  assert.equal(matchesCardStatus('n1', 'all', mastered, hardSet), true);
  assert.equal(matchesCardStatus('n1', 'mastered', mastered, hardSet), true);
  assert.equal(matchesCardStatus('n1', 'unmastered', mastered, hardSet), false);
  assert.equal(matchesCardStatus('n1', 'hard', mastered, hardSet), false);

  assert.equal(matchesCardStatus('n3', 'mastered', mastered, hardSet), false);
  assert.equal(matchesCardStatus('n3', 'unmastered', mastered, hardSet), true);
  assert.equal(matchesCardStatus('n3', 'hard', mastered, hardSet), true);

  assert.equal(matchesCardStatus('n4', 'mastered', mastered, hardSet), false);
  assert.equal(matchesCardStatus('n4', 'unmastered', mastered, hardSet), true);
  assert.equal(matchesCardStatus('n4', 'hard', mastered, hardSet), false);
});

test('filterCardIndices and filterCardItems return exact subsets for every status filter', () => {
  const mastered = new Set(['n1', 'n4']);
  const hardSet = new Set(['n2', 'n6']);

  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, 'all', mastered, hardSet),
    [0, 1, 2, 3, 4, 5]
  );
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, 'unmastered', mastered, hardSet),
    [1, 2, 4, 5]
  );
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, 'mastered', mastered, hardSet),
    [0, 3]
  );
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, 'hard', mastered, hardSet),
    [1, 5]
  );

  assert.deepEqual(
    filterCardItems(SAMPLE_DATASET, 'mastered', mastered, hardSet).map(x => x.id),
    ['n1', 'n4']
  );
  assert.deepEqual(
    filterCardItems(SAMPLE_DATASET, 'unmastered', mastered, hardSet).map(x => x.id),
    ['n2', 'n3', 'n5', 'n6']
  );
  assert.deepEqual(
    filterCardItems(SAMPLE_DATASET, 'hard', mastered, hardSet).map(x => x.id),
    ['n2', 'n6']
  );
});

test('countCardStatuses and countItemStatuses keep mastered + unmastered === all', () => {
  const mastered = new Set(['n1', 'n2', 'n5']);
  const hardSet = new Set(['n3', 'n6']);

  const idxCounts = countCardStatuses(ALL_INDICES, SAMPLE_DATASET, mastered, hardSet);
  assert.deepEqual(idxCounts, { all: 6, unmastered: 3, mastered: 3, hard: 2 });
  assert.equal(idxCounts.mastered + idxCounts.unmastered, idxCounts.all);

  const itemCounts = countItemStatuses(SAMPLE_DATASET, mastered, hardSet);
  assert.deepEqual(itemCounts, idxCounts);

  // Scoped subset (e.g., filtered by difficulty or chapter)
  const scopedCounts = countCardStatuses([0, 1, 2], SAMPLE_DATASET, mastered, hardSet);
  assert.deepEqual(scopedCounts, { all: 3, unmastered: 1, mastered: 2, hard: 1 });
});

test('buildCardOrder supports shuffling across all 4 status filters without losing items', () => {
  const mastered = new Set(['n1', 'n2', 'n3']);
  const hardSet = new Set(['n4', 'n5', 'n6']);

  const orderedMastered = buildCardOrder(
    ALL_INDICES,
    SAMPLE_DATASET,
    'mastered',
    mastered,
    hardSet,
    false
  );
  assert.deepEqual(orderedMastered, [0, 1, 2]);

  const shuffledMastered = buildCardOrder(
    ALL_INDICES,
    SAMPLE_DATASET,
    'mastered',
    mastered,
    hardSet,
    true,
    makeSeqRng([0.1, 0.2, 0.3])
  );
  assert.equal(shuffledMastered.length, 3);
  assert.deepEqual([...shuffledMastered].sort((a, b) => a - b), [0, 1, 2]);
  assert.notDeepEqual(shuffledMastered, [0, 1, 2]);

  const shuffledUnmastered = buildCardOrder(
    ALL_INDICES,
    SAMPLE_DATASET,
    'unmastered',
    mastered,
    hardSet,
    true,
    makeSeqRng([0.0, 0.0, 0.0])
  );
  assert.deepEqual([...shuffledUnmastered].sort((a, b) => a - b), [3, 4, 5]);
  assert.notDeepEqual(shuffledUnmastered, [3, 4, 5]);

  const shuffledHard = buildCardOrder(
    ALL_INDICES,
    SAMPLE_DATASET,
    'hard',
    mastered,
    hardSet,
    true,
    makeSeqRng([0.0, 0.0, 0.0])
  );
  assert.deepEqual([...shuffledHard].sort((a, b) => a - b), [3, 4, 5]);
  assert.notDeepEqual(shuffledHard, [3, 4, 5]);
});

test('reshuffleDifferent guarantees visible change even on a 2-card deck', () => {
  // RNG always returning 0.999 produces identity order in Fisher-Yates
  const identityRng = () => 0.999;
  assert.deepEqual(shuffleItems([10, 20], identityRng), [10, 20]);

  const reshuffled = reshuffleDifferent([10, 20], [10, 20], undefined, identityRng);
  assert.deepEqual(reshuffled, [20, 10]);

  // Works with object items + key selector
  const twoItems = [SAMPLE_DATASET[0], SAMPLE_DATASET[1]];
  const reshuffledItems = reshuffleDifferent(twoItems, twoItems, item => item.id, identityRng);
  assert.deepEqual(
    reshuffledItems.map(x => x.id),
    ['n2', 'n1']
  );

  // Single-item or empty array stays intact
  assert.deepEqual(reshuffleDifferent([42], [42]), [42]);
  assert.deepEqual(reshuffleDifferent([], []), []);
});
