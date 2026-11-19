import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IRODORI_CHAPTERS,
  IRODORI_CHAPTER_NUMBERS,
  IRODORI_DATA,
  VALID_IRODORI_IDS,
  getIrodoriPoolIndices,
} from '../data/irodoriData';
import {
  IRODORI_BOOKS,
  IRODORI_BOOK_ORDER,
  getAvailableIrodoriBooks,
  getIrodoriBook,
  isIrodoriBookPopulated,
} from '../data/irodoriBooks';
import { buildIrodoriEntries } from '../data/irodoriShared';
import type { IrodoriChapterNumber, QuizModelKey } from '../types/kanji';
import { analyzeSentenceBlank, conjugateWord, getWordMeta } from './morphology';
import { ALL_5_KEYS, buildQuizBank, buildQuizSession, makeQuestion } from './quizEngine';
import {
  IRODORI_QUIZ_HISTORY_KEY,
  QUIZ_HISTORY_KEY,
  clearQuizHistory,
  loadQuizHistory,
  recordQuizSession,
} from './quizStats';
import {
  IRODORI_HARD_KEY,
  IRODORI_LS_KEY,
  type StorageLike,
  commitScopedProgressTransaction,
  safeLoadSet,
} from './storage';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function createDeterministicRng(seed = 2027): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('IRODORI_DATA contains 643 unique entries spanning Bab 1 to Bab 18', () => {
  assert.equal(IRODORI_DATA.length, 643);
  assert.equal(VALID_IRODORI_IDS.size, 643);
  assert.equal(Object.keys(IRODORI_CHAPTERS).length, 18);
  assert.deepEqual(
    IRODORI_CHAPTER_NUMBERS,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  );

  for (const chapter of IRODORI_CHAPTER_NUMBERS) {
    const indices = getIrodoriPoolIndices(chapter);
    assert.ok(indices.length > 0, `Bab ${chapter} should have at least one entry`);
  }
});

test('all 643 Irodori entries produce valid sentence blanks and handle tricky compounds', () => {
  const failures: string[] = [];

  for (const item of IRODORI_DATA) {
    const blank = analyzeSentenceBlank(item);
    if (!blank.maskedEx.includes('（　　）')) {
      failures.push(`${item.id} (${item.k}): missing blank in "${blank.maskedEx}"`);
    }
    if (!item.ex.includes(blank.targetSurface)) {
      failures.push(`${item.id} (${item.k}): targetSurface "${blank.targetSurface}" not in "${item.ex}"`);
    }
  }

  assert.deepEqual(failures, []);

  const byWord = new Map(IRODORI_DATA.map(it => [it.k, it]));
  assert.equal(getWordMeta(byWord.get('出る')!).pos, 'ichidan');
  assert.equal(getWordMeta(byWord.get('混ぜる')!).pos, 'ichidan');
  assert.equal(getWordMeta(byWord.get('手洗い')!).subPos, 'noun');
  assert.equal(getWordMeta(byWord.get('勉強する')!).subPos, 'suru');
  assert.equal(conjugateWord(byWord.get('勉強する')!, 'te'), '勉強して');
  assert.equal(conjugateWord(byWord.get('持って来る')!, 'te'), '持って来て');
});

test('all 18 Irodori chapters generate 4 unique valid options across all 5 quiz models', () => {
  const rng = createDeterministicRng(555);
  let checked = 0;

  for (const chapter of IRODORI_CHAPTER_NUMBERS as readonly IrodoriChapterNumber[]) {
    const bank = buildQuizBank('all', 'random5', IRODORI_DATA, chapter);
    assert.ok(bank.length > 0, `Bab ${chapter} quiz bank should not be empty`);

    for (const entry of bank) {
      const item = IRODORI_DATA[entry.kanjiIdx];
      assert.equal(item.chapter, chapter);
      const q = makeQuestion(item, entry.typeKey, 'all', IRODORI_DATA, rng, chapter);
      checked += 1;

      assert.equal(q.options.length, 4);
      const labels = q.options.map(o => o.label);
      const ids = q.options.map(o => o.item.id);
      assert.equal(new Set(labels).size, 4, `Bab ${chapter} ${item.id} (${entry.typeKey}) duplicate labels`);
      assert.equal(new Set(ids).size, 4, `Bab ${chapter} ${item.id} (${entry.typeKey}) duplicate ids`);
      assert.ok(ids.includes(item.id), `Bab ${chapter} ${item.id} missing correct answer`);

      if (entry.typeKey === 'ex2k') {
        assert.ok(q.exMeta);
        assert.ok(q.exMeta.maskedEx.includes('（　　）'));
        const correctOpt = q.options.find(o => o.item.id === item.id)!;
        assert.equal(correctOpt.label, q.exMeta.targetSurface);
      }
    }
  }

  assert.equal(checked, 643 * 5);

  for (const key of ALL_5_KEYS as QuizModelKey[]) {
    const session = buildQuizSession('all', key, 10, IRODORI_DATA, rng, 1);
    assert.equal(session.length, 10);
    for (const q of session) {
      assert.equal(q.item.chapter, 1);
      assert.equal(q.type, key);
    }
  }
});

test('Irodori quiz history and progress storage stay isolated from N4 storage keys', () => {
  const storage = new MemoryStorage();

  // Quiz history isolation + scopeLabel retention
  let irodoriHistory = loadQuizHistory(storage, IRODORI_QUIZ_HISTORY_KEY);
  irodoriHistory = recordQuizSession(
    irodoriHistory,
    {
      level: 'all',
      mode: 'random5',
      correct: 9,
      total: 10,
      scopeLabel: 'Bab 3',
      id: 'ir-quiz-1',
    },
    storage,
    IRODORI_QUIZ_HISTORY_KEY
  );

  assert.equal(loadQuizHistory(storage, QUIZ_HISTORY_KEY).length, 0);
  const reloadedHistory = loadQuizHistory(storage, IRODORI_QUIZ_HISTORY_KEY);
  assert.equal(reloadedHistory.length, 1);
  assert.equal(reloadedHistory[0].scopeLabel, 'Bab 3');

  clearQuizHistory(storage, IRODORI_QUIZ_HISTORY_KEY);
  assert.equal(loadQuizHistory(storage, IRODORI_QUIZ_HISTORY_KEY).length, 0);

  // Progress persistence isolation
  const result = commitScopedProgressTransaction(
    IRODORI_LS_KEY,
    IRODORI_HARD_KEY,
    new Set([IRODORI_DATA[0].id]),
    new Set([IRODORI_DATA[1].id]),
    storage
  );
  assert.equal(result.ok, true);
  assert.deepEqual([...safeLoadSet(IRODORI_LS_KEY, VALID_IRODORI_IDS, storage)], [IRODORI_DATA[0].id]);
  assert.deepEqual([...safeLoadSet(IRODORI_HARD_KEY, VALID_IRODORI_IDS, storage)], [IRODORI_DATA[1].id]);
});

test('IRODORI_BOOKS prepares Pemula, Dasar 1, and Dasar 2 with unique keys, Bab 1-18 metadata, and entry builder', () => {
  assert.deepEqual(IRODORI_BOOK_ORDER, ['pemula', 'dasar1', 'dasar2']);

  const lsKeys = new Set<string>();
  const hardKeys = new Set<string>();
  const quizKeys = new Set<string>();
  const idPrefixes = new Set<string>();

  for (const bookId of IRODORI_BOOK_ORDER) {
    const book = getIrodoriBook(bookId);
    assert.equal(Object.keys(book.chapters).length, 18);
    lsKeys.add(book.lsKey);
    hardKeys.add(book.hardKey);
    quizKeys.add(book.quizHistoryKey);
    idPrefixes.add(book.idPrefix);
  }

  assert.equal(lsKeys.size, 3);
  assert.equal(hardKeys.size, 3);
  assert.equal(quizKeys.size, 3);
  assert.equal(idPrefixes.size, 3);

  assert.equal(isIrodoriBookPopulated('dasar1'), true);
  assert.equal(isIrodoriBookPopulated('pemula'), true);
  assert.equal(isIrodoriBookPopulated('dasar2'), false);
  assert.deepEqual(
    getAvailableIrodoriBooks().map(b => b.id),
    ['pemula', 'dasar1']
  );

  // Verify Irodori Pemula full Bab 1-18 dataset, PDF link, sentence blanks, and 5-model quiz options
  const pemula = IRODORI_BOOKS.pemula;
  assert.ok(pemula.data.length >= 700, `Expected full Pemula dataset, got ${pemula.data.length}`);
  assert.equal(pemula.validIds.size, pemula.data.length);
  assert.equal(
    pemula.pdfPath,
    'https://drive.google.com/file/d/1Pqbslo4_fbmWlyy7aRdmXZs40DS98p0O/view?pli=1'
  );
  assert.equal(pemula.data[0].k, 'おはよう(ございます)');
  assert.equal(pemula.data[0].romaji, 'ohayoo (gozaimasu)');
  assert.deepEqual(pemula.data[0].kanjiList, []);

  const shitsurei = pemula.data.find(it => it.k === '失礼します');
  assert.ok(shitsurei, 'Expected 失礼します in Bab 1');
  assert.deepEqual(shitsurei.kanjiList, ['失', '礼']);

  for (const chapter of IRODORI_CHAPTER_NUMBERS) {
    const chItems = pemula.data.filter(it => it.chapter === chapter);
    assert.ok(chItems.length >= 4, `Pemula Bab ${chapter} should have at least 4 entries`);
    assert.ok(!pemula.chapters[chapter].jpTitle.includes('未入力'), `Pemula Bab ${chapter} title should be populated`);
  }

  const blankFailures: string[] = [];
  for (const item of pemula.data) {
    const blank = analyzeSentenceBlank(item);
    if (!blank.maskedEx.includes('（　　）')) {
      blankFailures.push(`${item.id} (Bab ${item.chapter} ${item.k}): missing blank in "${blank.maskedEx}"`);
    }
    if (!item.ex.includes(blank.targetSurface)) {
      blankFailures.push(`${item.id} (Bab ${item.chapter} ${item.k}): targetSurface "${blank.targetSurface}" not in "${item.ex}"`);
    }
  }
  assert.deepEqual(blankFailures, []);

  const rng = createDeterministicRng(777);
  const quizFailures: string[] = [];
  let pemulaChecked = 0;

  for (const chapter of IRODORI_CHAPTER_NUMBERS as readonly IrodoriChapterNumber[]) {
    const bank = buildQuizBank('all', 'random5', pemula.data, chapter);
    assert.ok(bank.length > 0, `Pemula Bab ${chapter} quiz bank should not be empty`);

    for (const entry of bank) {
      const item = pemula.data[entry.kanjiIdx];
      const q = makeQuestion(item, entry.typeKey, 'all', pemula.data, rng, chapter);
      pemulaChecked += 1;

      const labels = q.options.map(o => o.label);
      const ids = q.options.map(o => o.item.id);
      if (q.options.length !== 4) {
        quizFailures.push(`Bab ${chapter} ${item.id} (${entry.typeKey}): expected 4 options, got ${q.options.length}`);
      }
      if (new Set(labels).size !== 4) {
        quizFailures.push(`Bab ${chapter} ${item.id} (${item.k}, ${entry.typeKey}): duplicate labels ${JSON.stringify(labels)}`);
      }
      if (new Set(ids).size !== 4) {
        quizFailures.push(`Bab ${chapter} ${item.id} (${entry.typeKey}): duplicate ids`);
      }
      if (!ids.includes(item.id)) {
        quizFailures.push(`Bab ${chapter} ${item.id} (${entry.typeKey}): missing correct answer`);
      }
      if (entry.typeKey === 'ex2k') {
        const correctOpt = q.options.find(o => o.item.id === item.id);
        if (!q.exMeta || !q.exMeta.maskedEx.includes('（　　）') || correctOpt?.label !== q.exMeta.targetSurface) {
          quizFailures.push(`Bab ${chapter} ${item.id} (ex2k): blank/label mismatch`);
        }
      }
    }
  }

  assert.deepEqual(quizFailures, []);
  assert.equal(pemulaChecked, pemula.data.length * 5);

  // Verify tuple builder for future books
  const sample = buildIrodoriEntries(
    [
      [1, '日本', 'にほん', 'にほ↓ん', 'Jepang', '1. はじめまして', '日本へ来ました。', 'Saya datang ke Jepang.'],
      [14, '経験', 'けいけん', 'けいけん○', 'pengalaman', '1. アルバイト', '仕事をした経験があります。', 'Ada pengalaman kerja.'],
    ],
    'ir2_'
  );
  assert.equal(sample.length, 2);
  assert.equal(sample[0].id, 'ir2_1');
  assert.equal(sample[0].dif, 'easy');
  assert.equal(sample[0].chapter, 1);
  assert.equal(sample[1].id, 'ir2_2');
  assert.equal(sample[1].dif, 'hard');
  assert.equal(sample[1].chapter, 14);
  assert.equal(IRODORI_BOOKS.dasar2.data.length, 0);
});
