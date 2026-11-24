import assert from 'node:assert/strict';
import test from 'node:test';
import { IRODORI_BOOKS } from '../data/irodoriBooks';
import { JFT_KANJI_WHITELIST, JFT_MASTER_TXT_KANJI } from '../data/jftKanjiWhitelist';
import { KANJI } from '../data/kanjiData';
import {
  classifyIrodoriKanji,
  countIrodoriKanjiScopes,
  extractUniqueKanji,
  getOutsideWhitelistKanji,
  isAdvancedKanjiEntry,
  matchesIrodoriKanjiScope,
} from './irodoriKanjiFilter';
import { buildQuizSession } from './quizEngine';

test('JFT_KANJI_WHITELIST includes all master txt Kanji and all kanjiData.ts Kanji without non-Kanji characters', () => {
  assert.ok(JFT_MASTER_TXT_KANJI.length >= 960, 'Expected at least 960 unique Kanji from master txt');
  assert.ok(
    JFT_KANJI_WHITELIST.size >= JFT_MASTER_TXT_KANJI.length,
    'Expected merged whitelist >= master txt Kanji count'
  );

  // Ensure no hiragana, katakana, romaji, punctuation, or iteration mark crept into the whitelist
  for (const ch of JFT_KANJI_WHITELIST) {
    assert.match(ch, /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]$/);
  }

  // Every Kanji in src/data/kanjiData.ts must be included as safety net
  for (const entry of KANJI) {
    for (const ch of extractUniqueKanji(entry.k)) {
      assert.equal(
        JFT_KANJI_WHITELIST.has(ch),
        true,
        `Missing N4 kanjiData character "${ch}" from ${entry.k}`
      );
    }
  }
});

test('classifyIrodoriKanji distinguishes kana-only, N4/JFT whitelist Kanji, and Kanji Lanjutan accurately', () => {
  // Pure hiragana & katakana -> Fokus N4/JFT
  assert.equal(classifyIrodoriKanji({ k: 'ありがとう' }), 'jft');
  assert.equal(classifyIrodoriKanji({ k: 'エレベーター' }), 'jft');

  // Whitelisted N5/N4/JFT Kanji + iteration mark 々 -> Fokus N4/JFT
  assert.equal(classifyIrodoriKanji({ k: '色々' }), 'jft');
  assert.equal(classifyIrodoriKanji({ k: '図書館' }), 'jft');
  assert.equal(classifyIrodoriKanji({ k: '駐車場' }), 'jft');
  assert.equal(isAdvancedKanjiEntry({ k: '図書館' }), false);

  // Out-of-whitelist Kanji -> Kanji Lanjutan
  assert.equal(classifyIrodoriKanji({ k: '展望台' }), 'advanced');
  assert.deepEqual(getOutsideWhitelistKanji({ k: '展望台' }), ['展']);
  assert.equal(classifyIrodoriKanji({ k: '展覧会' }), 'advanced');
  assert.deepEqual(getOutsideWhitelistKanji({ k: '展覧会' }), ['展', '覧']);
  assert.equal(isAdvancedKanjiEntry({ k: '展覧会' }), true);

  assert.equal(matchesIrodoriKanjiScope({ k: '図書館' }, 'all'), true);
  assert.equal(matchesIrodoriKanjiScope({ k: '図書館' }, 'jft'), true);
  assert.equal(matchesIrodoriKanjiScope({ k: '図書館' }, 'advanced'), false);
  assert.equal(matchesIrodoriKanjiScope({ k: '展望台' }, 'jft'), false);
  assert.equal(matchesIrodoriKanjiScope({ k: '展望台' }, 'advanced'), true);
});

test('all 3 Irodori books partition cleanly into Fokus N4/JFT + Kanji Lanjutan and build valid filtered quizzes', () => {
  for (const book of Object.values(IRODORI_BOOKS)) {
    const counts = countIrodoriKanjiScopes(book.data);
    assert.equal(counts.all, book.data.length);
    assert.equal(counts.jft + counts.advanced, counts.all);
    assert.ok(counts.jft > 0, `${book.id} should have Fokus N4/JFT entries`);
    assert.ok(counts.advanced > 0, `${book.id} should have Kanji Lanjutan entries`);

    // Verify Fokus N4/JFT quiz only prompts Fokus N4/JFT items and keeps distractors inside Fokus N4/JFT
    const jftQuestions = buildQuizSession(
      'all',
      'random5',
      25,
      book.data,
      () => 0.42,
      'all',
      item => matchesIrodoriKanjiScope(item, 'jft')
    );
    assert.equal(jftQuestions.length, 25);
    for (const q of jftQuestions) {
      assert.equal(matchesIrodoriKanjiScope(q.item, 'jft'), true);
      assert.equal(q.options.length, 4);
      for (const opt of q.options) {
        assert.equal(
          matchesIrodoriKanjiScope(opt.item, 'jft'),
          true,
          `${book.id} Fokus N4/JFT quiz leaked advanced distractor "${opt.item.k}"`
        );
      }
    }

    // Verify Kanji Lanjutan quiz only prompts Kanji Lanjutan items and always builds 4 unique options
    const advQuestions = buildQuizSession(
      'all',
      'random5',
      25,
      book.data,
      () => 0.42,
      'all',
      item => matchesIrodoriKanjiScope(item, 'advanced')
    );
    assert.equal(advQuestions.length, 25);
    for (const q of advQuestions) {
      assert.equal(matchesIrodoriKanjiScope(q.item, 'advanced'), true);
      assert.equal(q.options.length, 4);
      const uniqueLabels = new Set(q.options.map(o => o.label));
      assert.equal(uniqueLabels.size, 4);
    }
  }
});
