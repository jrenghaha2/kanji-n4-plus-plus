import test from 'node:test';
import assert from 'node:assert/strict';
import type { KanjiEntry } from '../types/kanji';
import {
  buildCardOrder,
  countCardStatuses,
  countItemStatuses,
  filterCardIndices,
  filterCardItems,
  formatSelectedStatusesLabel,
  getItemStatusCategory,
  matchesCardStatuses,
  reshuffleDifferent,
  shuffleItems,
  toggleCardStatusSelection,
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

test('getItemStatusCategory strictly separates unmarked, mastered, and hard', () => {
  const mastered = new Set(['n1', 'n2']);
  const hardSet = new Set(['n3', 'n5']);

  assert.equal(getItemStatusCategory('n1', mastered, hardSet), 'mastered');
  assert.equal(getItemStatusCategory('n3', mastered, hardSet), 'hard');
  assert.equal(getItemStatusCategory('n4', mastered, hardSet), 'unmarked');
  assert.equal(getItemStatusCategory('n6', mastered, hardSet), 'unmarked');

  // Hard items are NOT classified as unmarked
  assert.equal(matchesCardStatuses('n3', ['unmarked'], mastered, hardSet), false);
  assert.equal(matchesCardStatuses('n3', ['hard'], mastered, hardSet), true);
  assert.equal(matchesCardStatuses('n3', ['unmarked', 'hard'], mastered, hardSet), true);
  assert.equal(matchesCardStatuses('n4', ['unmarked'], mastered, hardSet), true);
  assert.equal(matchesCardStatuses('n4', ['hard'], mastered, hardSet), false);
});

test('toggleCardStatusSelection supports single, multi-select (2 categories), and automatic normalization to Semua', () => {
  // From Semua ([]), clicking one selects only that category
  assert.deepEqual(toggleCardStatusSelection([], 'unmarked'), ['unmarked']);
  assert.deepEqual(toggleCardStatusSelection([], 'hard'), ['hard']);
  assert.deepEqual(toggleCardStatusSelection([], 'mastered'), ['mastered']);

  // Adding a second category preserves canonical order ['unmarked', 'mastered', 'hard']
  assert.deepEqual(toggleCardStatusSelection(['hard'], 'unmarked'), ['unmarked', 'hard']);
  assert.deepEqual(toggleCardStatusSelection(['hard'], 'mastered'), ['mastered', 'hard']);
  assert.deepEqual(toggleCardStatusSelection(['mastered'], 'unmarked'), ['unmarked', 'mastered']);

  // Adding the 3rd category normalizes back to [] (Semua)
  assert.deepEqual(toggleCardStatusSelection(['unmarked', 'hard'], 'mastered'), []);

  // Removing one of 2 leaves the other
  assert.deepEqual(toggleCardStatusSelection(['unmarked', 'hard'], 'unmarked'), ['hard']);

  // Removing the last remaining category normalizes back to [] (Semua)
  assert.deepEqual(toggleCardStatusSelection(['hard'], 'hard'), []);

  assert.equal(formatSelectedStatusesLabel([]), 'Semua');
  assert.equal(formatSelectedStatusesLabel(['unmarked']), 'Belum ditandai');
  assert.equal(
    formatSelectedStatusesLabel(['unmarked', 'hard']),
    'Belum ditandai + Sulit'
  );
  assert.equal(
    formatSelectedStatusesLabel(['mastered', 'hard']),
    'Sudah hafal + Sulit'
  );
});

test('filterCardIndices and filterCardItems support single and multi-category combinations', () => {
  const mastered = new Set(['n1', 'n4']); // indices 0, 3
  const hardSet = new Set(['n2', 'n6']);  // indices 1, 5
  // unmarked: n3, n5 -> indices 2, 4

  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, [], mastered, hardSet),
    [0, 1, 2, 3, 4, 5]
  );
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, ['unmarked'], mastered, hardSet),
    [2, 4]
  );
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, ['mastered'], mastered, hardSet),
    [0, 3]
  );
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, ['hard'], mastered, hardSet),
    [1, 5]
  );
  // Multi-select: Belum ditandai + Sulit (all not-yet-mastered)
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, ['unmarked', 'hard'], mastered, hardSet),
    [1, 2, 4, 5]
  );
  // Multi-select: Sudah hafal + Sulit (all marked cards)
  assert.deepEqual(
    filterCardIndices(ALL_INDICES, SAMPLE_DATASET, ['mastered', 'hard'], mastered, hardSet),
    [0, 1, 3, 5]
  );

  assert.deepEqual(
    filterCardItems(SAMPLE_DATASET, ['unmarked'], mastered, hardSet).map(x => x.id),
    ['n3', 'n5']
  );
  assert.deepEqual(
    filterCardItems(SAMPLE_DATASET, ['unmarked', 'mastered'], mastered, hardSet).map(x => x.id),
    ['n1', 'n3', 'n4', 'n5']
  );
});

test('countCardStatuses and countItemStatuses partition all === unmarked + mastered + hard', () => {
  const mastered = new Set(['n1', 'n2']);
  const hardSet = new Set(['n3', 'n6']);
  // unmarked: n4, n5 (2)

  const idxCounts = countCardStatuses(ALL_INDICES, SAMPLE_DATASET, mastered, hardSet);
  assert.deepEqual(idxCounts, { all: 6, unmarked: 2, mastered: 2, hard: 2 });
  assert.equal(idxCounts.unmarked + idxCounts.mastered + idxCounts.hard, idxCounts.all);

  const itemCounts = countItemStatuses(SAMPLE_DATASET, mastered, hardSet);
  assert.deepEqual(itemCounts, idxCounts);

  // Scoped subset (e.g., filtered by difficulty or chapter)
  const scopedCounts = countCardStatuses([0, 2, 3], SAMPLE_DATASET, mastered, hardSet);
  assert.deepEqual(scopedCounts, { all: 3, unmarked: 1, mastered: 1, hard: 1 });
});

test('buildCardOrder supports shuffling across single and multi-category selections without losing items', () => {
  const mastered = new Set(['n1', 'n2']);
  const hardSet = new Set(['n3', 'n4']);
  // unmarked: n5, n6

  const orderedMulti = buildCardOrder(
    ALL_INDICES,
    SAMPLE_DATASET,
    ['unmarked', 'hard'],
    mastered,
    hardSet,
    false
  );
  assert.deepEqual(orderedMulti, [2, 3, 4, 5]);

  const shuffledMulti = buildCardOrder(
    ALL_INDICES,
    SAMPLE_DATASET,
    ['unmarked', 'hard'],
    mastered,
    hardSet,
    true,
    makeSeqRng([0.1, 0.2, 0.3, 0.4])
  );
  assert.equal(shuffledMulti.length, 4);
  assert.deepEqual([...shuffledMulti].sort((a, b) => a - b), [2, 3, 4, 5]);
  assert.notDeepEqual(shuffledMulti, [2, 3, 4, 5]);
});

test('reshuffleDifferent guarantees visible change even on a 2-card deck', () => {
  const identityRng = () => 0.999;
  assert.deepEqual(shuffleItems([10, 20], identityRng), [10, 20]);

  const reshuffled = reshuffleDifferent([10, 20], [10, 20], undefined, identityRng);
  assert.deepEqual(reshuffled, [20, 10]);

  const twoItems = [SAMPLE_DATASET[0], SAMPLE_DATASET[1]];
  const reshuffledItems = reshuffleDifferent(twoItems, twoItems, item => item.id, identityRng);
  assert.deepEqual(
    reshuffledItems.map(x => x.id),
    ['n2', 'n1']
  );

  assert.deepEqual(reshuffleDifferent([42], [42]), [42]);
  assert.deepEqual(reshuffleDifferent([], []), []);
});
