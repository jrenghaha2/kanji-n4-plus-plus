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
import {
  ALL_5_KEYS,
  HAS_KANJI_RE,
  buildQuizBank,
  buildQuizSession,
  formatChapterSelectionLabel,
  hasMeaningCollision,
  isEntryEligibleForQuizModel,
  makeQuestion,
  normalizeTermText,
} from './quizEngine';
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

test('IRODORI_DATA contains 1067 unique entries spanning Bab 1 to Bab 18 with legacy IDs intact', () => {
  assert.equal(IRODORI_DATA.length, 1067);
  assert.equal(VALID_IRODORI_IDS.size, 1067);
  assert.equal(Object.keys(IRODORI_CHAPTERS).length, 18);
  assert.deepEqual(
    IRODORI_CHAPTER_NUMBERS,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  );

  // Legacy IDs ir1..ir643 must remain valid for saved user progress
  for (let i = 1; i <= 643; i++) {
    assert.ok(VALID_IRODORI_IDS.has(`ir${i}`), `Missing legacy Dasar 1 ID ir${i}`);
  }

  // Entries are ordered monotonically by chapter 1..18
  for (let i = 1; i < IRODORI_DATA.length; i++) {
    assert.ok(
      (IRODORI_DATA[i - 1].chapter ?? 0) <= (IRODORI_DATA[i].chapter ?? 0),
      `Dasar 1 chapters out of order at index ${i}`
    );
  }

  for (const chapter of IRODORI_CHAPTER_NUMBERS) {
    const indices = getIrodoriPoolIndices(chapter);
    assert.ok(indices.length > 0, `Bab ${chapter} should have at least one entry`);
  }
});

test('all 1067 Dasar 1 Irodori entries produce valid sentence blanks and handle tricky compounds', () => {
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

  const expectedDasar1Bank = IRODORI_DATA.reduce(
    (sum, item) => sum + ALL_5_KEYS.filter(k => isEntryEligibleForQuizModel(item, k)).length,
    0
  );
  assert.equal(checked, expectedDasar1Bank);

  for (const key of ALL_5_KEYS as QuizModelKey[]) {
    const session = buildQuizSession('all', key, 10, IRODORI_DATA, rng, 1);
    assert.ok(session.length > 0 && session.length <= 10);
    for (const q of session) {
      assert.equal(q.item.chapter, 1);
      assert.equal(q.type, key);
    }
  }

  // Multi-chapter selection combines only requested chapters cleanly
  const multiChapters: IrodoriChapterNumber[] = [1, 3, 5];
  const multiBank = buildQuizBank('all', 'random5', IRODORI_DATA, multiChapters);
  const expectedMultiCount = IRODORI_DATA.filter(
    it => it.chapter === 1 || it.chapter === 3 || it.chapter === 5
  ).reduce(
    (sum, it) => sum + ALL_5_KEYS.filter(k => isEntryEligibleForQuizModel(it, k)).length,
    0
  );
  assert.equal(multiBank.length, expectedMultiCount);

  const multiSession = buildQuizSession('all', 'random5', 30, IRODORI_DATA, rng, multiChapters);
  assert.equal(multiSession.length, 30);
  for (const q of multiSession) {
    assert.ok(
      q.item.chapter === 1 || q.item.chapter === 3 || q.item.chapter === 5,
      `Expected chapter in [1,3,5], got ${q.item.chapter}`
    );
    assert.equal(q.options.length, 4);
  }

  // Empty multi-chapter selection produces empty bank/session safely
  assert.equal(buildQuizBank('all', 'random5', IRODORI_DATA, []).length, 0);
  assert.equal(buildQuizSession('all', 'random5', 10, IRODORI_DATA, rng, []).length, 0);

  // Scope label formatting for multi-chapter selections
  assert.equal(formatChapterSelectionLabel([]), 'Belum ada bab dipilih');
  assert.equal(formatChapterSelectionLabel([4]), 'Bab 4');
  assert.equal(formatChapterSelectionLabel([1, 2, 3, 5, 8, 9]), 'Bab 1–3, 5, 8–9');
  assert.equal(formatChapterSelectionLabel([...IRODORI_CHAPTER_NUMBERS]), 'Semua Bab (1–18)');
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
  assert.equal(isIrodoriBookPopulated('dasar2'), true);
  assert.deepEqual(
    getAvailableIrodoriBooks().map(b => b.id),
    ['pemula', 'dasar1', 'dasar2']
  );

  // Verify Irodori Pemula full Bab 1-18 dataset, PDF link, sentence blanks, and 5-model quiz options
  const pemula = IRODORI_BOOKS.pemula;
  assert.equal(pemula.data.length, 1136, `Expected full 1136 Pemula dataset, got ${pemula.data.length}`);
  assert.equal(pemula.validIds.size, pemula.data.length);
  for (let i = 1; i <= 769; i++) {
    assert.ok(pemula.validIds.has(`irp${i}`), `Missing legacy Pemula ID irp${i}`);
  }
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
  const expectedPemulaBank = pemula.data.reduce(
    (sum, it) => sum + ALL_5_KEYS.filter(k => isEntryEligibleForQuizModel(it, k)).length,
    0
  );
  assert.equal(pemulaChecked, expectedPemulaBank);

  // Verify Irodori Dasar 2 full Bab 1-18 dataset, PDF link, sentence blanks, and 5-model quiz options
  const dasar2 = IRODORI_BOOKS.dasar2;
  assert.ok(dasar2.data.length >= 600, `Expected full Dasar 2 dataset, got ${dasar2.data.length}`);
  assert.equal(dasar2.validIds.size, dasar2.data.length);
  assert.equal(
    dasar2.pdfPath,
    'https://drive.google.com/file/d/13XALHensHPg17psVHBMcODXkRIM19f_E/view'
  );

  for (const chapter of IRODORI_CHAPTER_NUMBERS) {
    const chItems = dasar2.data.filter(it => it.chapter === chapter);
    assert.ok(chItems.length >= 4, `Dasar 2 Bab ${chapter} should have at least 4 entries`);
    assert.ok(!dasar2.chapters[chapter].jpTitle.includes('未入力'), `Dasar 2 Bab ${chapter} title should be populated`);
  }

  const d2BlankFailures: string[] = [];
  for (const item of dasar2.data) {
    const blank = analyzeSentenceBlank(item);
    if (!blank.maskedEx.includes('（　　）')) {
      d2BlankFailures.push(`${item.id} (Bab ${item.chapter} ${item.k}): missing blank in "${blank.maskedEx}"`);
    }
    if (!item.ex.includes(blank.targetSurface)) {
      d2BlankFailures.push(`${item.id} (Bab ${item.chapter} ${item.k}): targetSurface "${blank.targetSurface}" not in "${item.ex}"`);
    }
  }
  assert.deepEqual(d2BlankFailures, []);

  const rng2 = createDeterministicRng(888);
  const d2QuizFailures: string[] = [];
  let d2Checked = 0;

  for (const chapter of IRODORI_CHAPTER_NUMBERS as readonly IrodoriChapterNumber[]) {
    const bank = buildQuizBank('all', 'random5', dasar2.data, chapter);
    assert.ok(bank.length > 0, `Dasar 2 Bab ${chapter} quiz bank should not be empty`);

    for (const entry of bank) {
      const item = dasar2.data[entry.kanjiIdx];
      const q = makeQuestion(item, entry.typeKey, 'all', dasar2.data, rng2, chapter);
      d2Checked += 1;

      const labels = q.options.map(o => o.label);
      const ids = q.options.map(o => o.item.id);
      if (q.options.length !== 4) {
        d2QuizFailures.push(`Bab ${chapter} ${item.id} (${entry.typeKey}): expected 4 options, got ${q.options.length}`);
      }
      if (new Set(labels).size !== 4) {
        d2QuizFailures.push(`Bab ${chapter} ${item.id} (${item.k}, ${entry.typeKey}): duplicate labels ${JSON.stringify(labels)}`);
      }
      if (new Set(ids).size !== 4) {
        d2QuizFailures.push(`Bab ${chapter} ${item.id} (${entry.typeKey}): duplicate ids`);
      }
      if (!ids.includes(item.id)) {
        d2QuizFailures.push(`Bab ${chapter} ${item.id} (${entry.typeKey}): missing correct answer`);
      }
      if (entry.typeKey === 'ex2k') {
        const correctOpt = q.options.find(o => o.item.id === item.id);
        if (!q.exMeta || !q.exMeta.maskedEx.includes('（　　）') || correctOpt?.label !== q.exMeta.targetSurface) {
          d2QuizFailures.push(`Bab ${chapter} ${item.id} (ex2k): blank/label mismatch`);
        }
      }
    }
  }

  assert.deepEqual(d2QuizFailures, []);
  const expectedD2Bank = dasar2.data.reduce(
    (sum, it) => sum + ALL_5_KEYS.filter(k => isEntryEligibleForQuizModel(it, k)).length,
    0
  );
  assert.equal(d2Checked, expectedD2Bank);

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
});

test('all 3 Irodori books guarantee zero ambiguous or duplicate correct answers across all 5 models', () => {
  const rng = createDeterministicRng(2028);
  const violations: string[] = [];

  for (const bookId of IRODORI_BOOK_ORDER) {
    const book = getIrodoriBook(bookId);
    const sameKReadingsMap = new Map<string, Set<string>>();
    for (const e of book.data) {
      const nk = normalizeTermText(e.k);
      const set = sameKReadingsMap.get(nk) ?? new Set<string>();
      set.add(normalizeTermText(e.r));
      sameKReadingsMap.set(nk, set);
    }

    for (const item of book.data) {
      for (const typeKey of ALL_5_KEYS) {
        const q = makeQuestion(item, typeKey, 'all', book.data, rng, 'all');
        const distractors = q.options.filter(o => o.item.id !== item.id);
        const normKs = new Set(q.options.map(o => normalizeTermText(o.item.k)));
        const normRs = new Set(q.options.map(o => normalizeTermText(o.item.r)));
        const labels = new Set(q.options.map(o => o.label));

        if (labels.size !== 4) {
          violations.push(`${bookId}/${item.id}/${typeKey}: duplicate labels`);
        }
        if (normKs.size !== 4) {
          violations.push(`${bookId}/${item.id}/${typeKey}: homograph collision in options`);
        }
        if (normRs.size !== 4) {
          violations.push(`${bookId}/${item.id}/${typeKey}: homophone collision in options`);
        }
        if (typeKey === 'k2r') {
          const validReadings = sameKReadingsMap.get(normalizeTermText(item.k)) ?? new Set();
          for (const d of distractors) {
            if (validReadings.has(normalizeTermText(d.item.r))) {
              violations.push(
                `${bookId}/${item.id}/k2r (${item.k}): distractor ${d.item.r} is another valid reading`
              );
            }
          }
        }
        if (typeKey === 'k2m' || typeKey === 'm2k' || typeKey === 'ex2k') {
          for (const d of distractors) {
            if (hasMeaningCollision(item.m, d.item.m)) {
              violations.push(
                `${bookId}/${item.id}/${typeKey} (${item.k}="${item.m}"): synonym distractor ${d.item.k}="${d.item.m}"`
              );
            }
          }
        }
      }
    }
  }

  assert.deepEqual(violations, []);

  // Verify promptHint disambiguates Dasar 2 homographs like 空 (そら vs から) and 開く (ひらく vs あく)
  const dasar2 = IRODORI_BOOKS.dasar2.data;
  const sora = dasar2.find(it => it.k === '空' && it.r === 'そら')!;
  assert.ok(sora);
  const qSoraK2R = makeQuestion(sora, 'k2r', 'all', dasar2, rng, 'all');
  assert.ok(qSoraK2R.promptHint?.includes(sora.m), 'Expected meaning hint for 空 k2r');
  const qSoraK2M = makeQuestion(sora, 'k2m', 'all', dasar2, rng, 'all');
  assert.ok(qSoraK2M.promptHint?.includes(sora.r), 'Expected reading hint for 空 k2m');
});

test('Irodori k2r/r2k exclude kana-only & sentence outliers and balance distractor lengths cleanly', () => {
  const rng = createDeterministicRng(4040);

  for (const bookId of IRODORI_BOOK_ORDER) {
    const book = getIrodoriBook(bookId);
    const k2rBank = buildQuizBank('all', 'k2r', book.data, 'all');
    const r2kBank = buildQuizBank('all', 'r2k', book.data, 'all');
    assert.ok(k2rBank.length > 0, `${bookId} should have k2r questions`);
    assert.equal(k2rBank.length, r2kBank.length);

    for (const entry of k2rBank) {
      const item = book.data[entry.kanjiIdx];
      assert.ok(HAS_KANJI_RE.test(item.k), `${bookId}/${item.id} (${item.k}) in k2r must contain Kanji`);
      assert.notEqual(
        normalizeTermText(item.k),
        normalizeTermText(item.r),
        `${bookId}/${item.id} in k2r must not have identical surface and reading`
      );
      assert.ok(item.r.length <= 13, `${bookId}/${item.id} reading length should not exceed 13 in k2r`);
    }

    // Spot-check r2k options strictly contain Kanji on every single distractor
    for (const entry of r2kBank) {
      const item = book.data[entry.kanjiIdx];
      const q = makeQuestion(item, 'r2k', 'all', book.data, rng, 'all');
      for (const opt of q.options) {
        assert.ok(
          HAS_KANJI_RE.test(opt.item.k),
          `${bookId}/${item.id} r2k distractor ${opt.item.k} must contain Kanji`
        );
      }
    }
  }

  // Specific regression checks from user-reported giveaways
  const pemula = IRODORI_BOOKS.pemula.data;
  const wasure = pemula.find(d => d.k.includes('お忘れ物'))!;
  assert.equal(isEntryEligibleForQuizModel(wasure, 'k2r'), false);
  assert.equal(isEntryEligibleForQuizModel(wasure, 'r2k'), false);
  assert.equal(isEntryEligibleForQuizModel(wasure, 'k2m'), true);
  assert.equal(isEntryEligibleForQuizModel(wasure, 'm2k'), true);

  const arigatou = pemula.find(d => d.k === 'ありがとうございます')!;
  assert.equal(isEntryEligibleForQuizModel(arigatou, 'k2r'), false);
  assert.equal(isEntryEligibleForQuizModel(arigatou, 'r2k'), false);

  // Even in single-chapter Bab 13 quiz, long expression distractors must not be 3-char giveaways
  const wasureM2K = makeQuestion(wasure, 'm2k', 'all', pemula, rng, 13);
  const wasureDistLens = wasureM2K.options
    .filter(o => o.item.id !== wasure.id)
    .map(o => o.label.length);
  assert.ok(
    Math.min(...wasureDistLens) >= 9,
    `Expected long distractors (>=9 chars) for ${wasure.k}, got ${JSON.stringify(wasureM2K.options.map(o => o.label))}`
  );

  const osaki = pemula.find(d => d.k === 'お先に失礼します')!;
  const osakiK2R = makeQuestion(osaki, 'k2r', 'all', pemula, rng, 1);
  const osakiDistLens = osakiK2R.options
    .filter(o => o.item.id !== osaki.id)
    .map(o => o.label.length);
  assert.ok(
    Math.min(...osakiDistLens) >= 8,
    `Expected long distractors (>=8 chars) for ${osaki.k}, got ${JSON.stringify(osakiK2R.options.map(o => o.label))}`
  );
});

test('Indonesian synonym collision detection blocks ambiguous distractors without over-blocking antonyms', () => {
  // Positive synonym collision cases (including user-reported だいたい vs たいてい)
  assert.equal(hasMeaningCollision('biasanya; kira-kira', 'umumnya; kebanyakan'), true);
  assert.equal(hasMeaningCollision('sekitar ～', 'sekitar ～; kurang lebih ～ (contoh: sekitar 10 menit)'), true);
  assert.equal(hasMeaningCollision('sangat bagus; luar biasa', 'menakjubkan; luar biasa'), true);
  assert.equal(hasMeaningCollision('bermacam-macam; berbagai', 'berbagai macam'), true);
  assert.equal(hasMeaningCollision('sekitar sini', 'sekitar; dekat sini'), true);
  assert.equal(hasMeaningCollision('biasanya', 'seperti biasanya'), true);
  assert.equal(hasMeaningCollision('sudah hampir; sebentar lagi', 'segera; sebentar lagi; hampir'), true);
  assert.equal(hasMeaningCollision('memakai; mengenakan (pakaian)', 'menggunakan'), true);
  assert.equal(hasMeaningCollision('wireless; nirkabel', 'tanpa kabel; cordless'), true);
  assert.equal(hasMeaningCollision('pengumuman (suara)', 'pemberitahuan; notifikasi'), true);
  assert.equal(hasMeaningCollision('sulit; susah', 'rumit; menyusahkan'), true);

  // Negative checks: antonyms & distinct categories must NOT be treated as synonyms
  assert.equal(hasMeaningCollision('enak; lezat', 'tidak enak; tidak lezat'), false);
  assert.equal(hasMeaningCollision('mahir; pandai', 'tidak suka; kurang mahir'), false);
  assert.equal(hasMeaningCollision('masalah', 'tidak masalah'), false);
  assert.equal(hasMeaningCollision('Selamat pagi.', 'Selamat malam.'), false);
  assert.equal(hasMeaningCollision('musim panas', 'musim dingin'), false);
  assert.equal(hasMeaningCollision('panas (cuaca)', 'hangat (cuaca)'), false);

  // Repeated quiz generation for だいたい must never pair with たいてい, ～ごろ, or ～ぐらい
  const rng = createDeterministicRng(7777);
  const pemula = IRODORI_BOOKS.pemula.data;
  const daitai = pemula.find(d => d.k === 'だいたい')!;
  assert.ok(daitai);
  const forbiddenIds = new Set(
    pemula
      .filter(d => ['たいてい', '～ごろ', '～ぐらい'].includes(d.k))
      .map(d => d.id)
  );
  assert.ok(forbiddenIds.size >= 3);

  for (let trial = 0; trial < 25; trial++) {
    for (const model of ['k2m', 'm2k', 'ex2k'] as const) {
      const q = makeQuestion(daitai, model, 'all', pemula, rng, 'all');
      assert.equal(q.options.length, 4);
      for (const opt of q.options) {
        assert.ok(
          !forbiddenIds.has(opt.item.id),
          `Trial ${trial} (${model}): だいたい should never compete with ${opt.item.k} (${opt.item.m})`
        );
      }
    }
  }
});

