import test from 'node:test';
import assert from 'node:assert/strict';
import { KANJI } from '../data/kanjiData';
import { analyzeSentenceBlank, conjugateWord, getWordMeta } from './morphology';

test('dataset contains 500 unique JLPT N4 kanji items', () => {
  assert.equal(KANJI.length, 500);
  const ids = new Set(KANJI.map(item => item.id));
  assert.equal(ids.size, 500);
});

test('all 500 entries produce valid sentence blanks without leaking target word', () => {
  const failures: string[] = [];

  for (const item of KANJI) {
    const blank = analyzeSentenceBlank(item);
    if (!blank.maskedEx.includes('（　　）')) {
      failures.push(`${item.id} (${item.k}): missing blank in "${blank.maskedEx}"`);
    }
    if (!item.ex.includes(blank.targetSurface)) {
      failures.push(`${item.id} (${item.k}): targetSurface "${blank.targetSurface}" not found in "${item.ex}"`);
    }
    // Check that masking actually hides the target kanji word from the prompt
    if (blank.maskedEx.includes(item.k)) {
      failures.push(`${item.id} (${item.k}): target kanji leaked in maskedEx "${blank.maskedEx}"`);
    }
  }

  assert.deepEqual(failures, []);
});

test('morphological classification handles godan-ru, ichidan, i-adj, na-adj, suru, and noun exceptions accurately', () => {
  const byKanji = new Map(KANJI.map(it => [it.k, it]));

  // Godan -ru verbs with i/e stem vowels
  for (const k of ['走る', '帰る', '知る', '減る', '滑る', '切る']) {
    const it = byKanji.get(k);
    if (it) assert.equal(getWordMeta(it).pos, 'godan', `${k} must be godan`);
  }

  // Ichidan verbs
  for (const k of ['起きる', '降りる', '着る', '食べる', '教える', '褒める', '捨てる']) {
    const it = byKanji.get(k);
    if (it) assert.equal(getWordMeta(it).pos, 'ichidan', `${k} must be ichidan`);
  }

  // Noun exceptions ending in い or り
  for (const k of ['答え', '気持ち', '昼休み', '祭り', '晴れ', 'お祝い', '引っ越し', '曇り', '匂い', 'お土産']) {
    const it = byKanji.get(k);
    assert.ok(it, `${k} should exist in dataset`);
    assert.equal(getWordMeta(it).subPos, 'noun', `${k} must be noun, not verb/adj`);
  }

  // Specific tricky conjugations from the dataset
  assert.equal(conjugateWord(byKanji.get('怒る')!, 'passive_mashita'), '怒られました');
  assert.equal(conjugateWord(byKanji.get('褒める')!, 'passive_mashita'), '褒められました');
  assert.equal(conjugateWord(byKanji.get('滑る')!, 'masu_stem'), '滑り');
  assert.equal(conjugateWord(byKanji.get('難しい')!, 'i_ku'), '難しく');
  assert.equal(conjugateWord(byKanji.get('楽しい')!, 'i_katta'), '楽しかった');
  assert.equal(conjugateWord(byKanji.get('使う')!, 'te'), '使って');
  assert.equal(conjugateWord(byKanji.get('泳ぐ')!, 'mashita'), '泳ぎました');
});
