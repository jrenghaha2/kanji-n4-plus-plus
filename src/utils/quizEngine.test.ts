import test from 'node:test';
import assert from 'node:assert/strict';
import { KANJI } from '../data/kanjiData';
import type { LevelFilter, QuizModelKey } from '../types/kanji';
import { getWordMeta } from './morphology';
import {
  ALL_5_KEYS,
  buildQuizBank,
  buildQuizSession,
  hasMeaningCollision,
  makeQuestion,
  normalizeTermText,
} from './quizEngine';

function createDeterministicRng(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('all 2,500 quiz questions (500 kanji x 5 models) generate 4 unique valid options with exact answer included', () => {
  const rng = createDeterministicRng(1234);
  const bank = buildQuizBank('all', 'random5', KANJI);
  assert.equal(bank.length, 2500);

  for (const entry of bank) {
    const item = KANJI[entry.kanjiIdx];
    const q = makeQuestion(item, entry.typeKey, 'all', KANJI, rng);

    assert.equal(q.options.length, 4, `${item.id} (${entry.typeKey}) should have 4 options`);
    const labels = q.options.map(o => o.label);
    const ids = q.options.map(o => o.item.id);
    assert.equal(new Set(labels).size, 4, `${item.id} (${entry.typeKey}) duplicate labels: ${labels.join(', ')}`);
    assert.equal(new Set(ids).size, 4, `${item.id} (${entry.typeKey}) duplicate item ids`);
    assert.ok(ids.includes(item.id), `${item.id} (${entry.typeKey}) missing correct answer`);

    if (entry.typeKey === 'ex2k') {
      assert.ok(q.exMeta);
      assert.ok(q.exMeta.maskedEx.includes('（　　）'));
      const correctOpt = q.options.find(o => o.item.id === item.id)!;
      assert.equal(correctOpt.label, q.exMeta.targetSurface);
    }
  }
});

test('ex2k sentence questions enforce POS/grammatical compatibility across all 500 items', () => {
  const rng = createDeterministicRng(777);
  const posMismatches: string[] = [];

  for (const item of KANJI) {
    const q = makeQuestion(item, 'ex2k', 'all', KANJI, rng);
    const ctx = q.exMeta!.blankContext;
    for (const opt of q.options) {
      const optSubPos = getWordMeta(opt.item).subPos;
      if (ctx === 'verb_conjugated' && optSubPos !== 'verb') {
        posMismatches.push(`${item.id} (${item.k}) verb slot got ${opt.item.k} (${optSubPos})`);
      }
      if (ctx === 'iadj_conjugated' && optSubPos !== 'iadj') {
        posMismatches.push(`${item.id} (${item.k}) iadj slot got ${opt.item.k} (${optSubPos})`);
      }
      if (ctx === 'naadj_modifier' && optSubPos !== 'naadj') {
        posMismatches.push(`${item.id} (${item.k}) naadj slot got ${opt.item.k} (${optSubPos})`);
      }
      if (ctx === 'suru_verb' && optSubPos !== 'suru') {
        posMismatches.push(`${item.id} (${item.k}) suru slot got ${opt.item.k} (${optSubPos})`);
      }
      if (ctx === 'noun_general' && (optSubPos === 'verb' || optSubPos === 'iadj')) {
        posMismatches.push(`${item.id} (${item.k}) noun slot got ${opt.item.k} (${optSubPos})`);
      }
    }
  }

  assert.deepEqual(posMismatches, []);
});

test('level isolation keeps distractors strictly within the active difficulty level for Easy, Medium, and Hard', () => {
  const rng = createDeterministicRng(999);
  const levels: Exclude<LevelFilter, 'all'>[] = ['easy', 'medium', 'hard'];
  const crossLevelLeaks: string[] = [];

  for (const lv of levels) {
    const session = buildQuizSession(lv, 'random5', 'all', KANJI, rng);
    for (const q of session) {
      assert.equal(q.item.dif, lv);
      for (const opt of q.options) {
        // Hard has only 2 na-adjectives (丁寧, 複雑), so naadj_modifier in Hard must borrow 2 na-adj distractors for grammatical validity
        const isHardNaAdjException = lv === 'hard' && q.type === 'ex2k' && q.exMeta?.blankContext === 'naadj_modifier';
        if (opt.item.dif !== lv && !isHardNaAdjException) {
          crossLevelLeaks.push(`[${lv}] ${q.item.id} (${q.type}) leaked ${opt.item.id} (${opt.item.dif})`);
        }
      }
    }
  }

  assert.deepEqual(crossLevelLeaks, []);
});

test('every model key in ALL_5_KEYS produces distinct labels when running buildQuizSession', () => {
  const rng = createDeterministicRng(2026);
  for (const key of ALL_5_KEYS as QuizModelKey[]) {
    const questions = buildQuizSession('easy', key, 20, KANJI, rng);
    assert.equal(questions.length, 20);
    for (const q of questions) {
      assert.equal(q.type, key);
      assert.equal(q.options.length, 4);
    }
  }
});

test('N4 quiz questions never present synonymous meanings, homophones, or homographs as competing options', () => {
  const rng = createDeterministicRng(3030);
  const violations: string[] = [];

  for (const item of KANJI) {
    for (const key of ALL_5_KEYS) {
      const q = makeQuestion(item, key, 'all', KANJI, rng);
      const distractors = q.options.filter(o => o.item.id !== item.id);
      const normKs = new Set(q.options.map(o => normalizeTermText(o.item.k)));
      const normRs = new Set(q.options.map(o => normalizeTermText(o.item.r)));
      if (normKs.size !== 4) violations.push(`${item.id}/${key}: homograph collision`);
      if (normRs.size !== 4) violations.push(`${item.id}/${key}: homophone collision`);
      if (key === 'k2m' || key === 'm2k' || key === 'ex2k') {
        for (const d of distractors) {
          if (hasMeaningCollision(item.m, d.item.m)) {
            violations.push(`${item.id}/${key} (${item.m}) collided with ${d.item.id} (${d.item.m})`);
          }
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
