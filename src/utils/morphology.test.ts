import test from 'node:test';
import assert from 'node:assert/strict';
import { KANJI } from '../data/kanjiData';
import { analyzeSentenceBlank, conjugateWord, getWordMeta } from './morphology';

test('dataset contains 538 unique JLPT N5-N4 kanji items and covers 100% of official N5 & N4 kanji', () => {
  assert.equal(KANJI.length, 538);
  const ids = new Set(KANJI.map(item => item.id));
  assert.equal(ids.size, 538);
  const uniqueKanjiWords = new Set(KANJI.map(item => item.k));
  assert.equal(uniqueKanjiWords.size, 538);

  const coveredChars = new Set<string>();
  for (const item of KANJI) {
    for (const ch of item.k) {
      if (/[\u4e00-\u9fff]/.test(ch)) coveredChars.add(ch);
    }
  }

  const officialN5 =
    '日一国人年大十二本中長出三時行見月分後前生五間上東四今金九入学高円子外八六下来気小七山話女北午百書先名川千水半男西電校語土木聞食車何南万毎白天母火右読友左休父雨';
  const officialN4 =
    '会同事自社発者地業方新場員立開手力問代明動京目通言理体田主題意不作要用度強公持野以思家世多正安院心界教文元重近考画海売知道集別物使品計死特私始朝運終台広住真有口少町料工建空急止送切転研足究楽起着店病質待試族銀早映親験英医仕去味写字答夜音注帰古歌買悪図週室歩風紙黒花春赤青館屋色走秋夏習駅洋旅服夕借曜飲肉貸堂鳥飯勉冬昼茶弟牛魚兄犬妹姉漢';

  const missingN5 = [...officialN5].filter(ch => !coveredChars.has(ch));
  const missingN4 = [...officialN4].filter(ch => !coveredChars.has(ch));
  assert.deepEqual(missingN5, []);
  assert.deepEqual(missingN4, []);
});

test('all 538 entries produce valid sentence blanks without leaking target word', () => {
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
  for (const k of ['走る', '帰る', '知る', '減る', '入る', '切る']) {
    const it = byKanji.get(k);
    assert.ok(it, `${k} should exist in dataset`);
    assert.equal(getWordMeta(it).pos, 'godan', `${k} must be godan`);
  }

  // Ichidan verbs
  for (const k of ['起きる', '降りる', '着る', '食べる', '教える', '見る', '捨てる']) {
    const it = byKanji.get(k);
    assert.ok(it, `${k} should exist in dataset`);
    assert.equal(getWordMeta(it).pos, 'ichidan', `${k} must be ichidan`);
  }

  // Noun exceptions ending in い or り
  for (const k of ['答え', '気持ち', '昼休み', '祭り', '晴れ', 'お祝い', '引っ越し', '曇り', '代わり', 'お土産']) {
    const it = byKanji.get(k);
    assert.ok(it, `${k} should exist in dataset`);
    assert.equal(getWordMeta(it).subPos, 'noun', `${k} must be noun, not verb/adj`);
  }

  // Hard na-adjectives exist and classify accurately
  for (const k of ['熱心', '丈夫', '盛ん', '適当', '確か']) {
    const it = byKanji.get(k);
    assert.ok(it, `${k} should exist in dataset`);
    assert.equal(getWordMeta(it).subPos, 'naadj', `${k} must be naadj`);
  }

  // Specific tricky conjugations from the dataset
  assert.equal(conjugateWord(byKanji.get('怒る')!, 'passive_mashita'), '怒られました');
  assert.equal(conjugateWord(byKanji.get('食べる')!, 'mashita'), '食べました');
  assert.equal(conjugateWord(byKanji.get('切る')!, 'mashita'), '切りました');
  assert.equal(conjugateWord(byKanji.get('難しい')!, 'i_ku'), '難しく');
  assert.equal(conjugateWord(byKanji.get('楽しい')!, 'i_katta'), '楽しかった');
  assert.equal(conjugateWord(byKanji.get('使う')!, 'te'), '使って');
  assert.equal(conjugateWord(byKanji.get('泳ぐ')!, 'mashita'), '泳ぎました');
});
