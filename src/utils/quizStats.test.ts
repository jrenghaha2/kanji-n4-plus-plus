import test from 'node:test';
import assert from 'node:assert/strict';
import { IRODORI_DATA } from '../data/irodoriData';
import { KANJI } from '../data/kanjiData';
import type { KanjiEntry, QuizAnswerSnapshot, QuizRecord } from '../types/kanji';
import { analyzeSentenceBlank } from './morphology';
import { dispOf } from './quizEngine';
import {
  QUIZ_SESSION_TOKEN_PATTERN,
  buildQuizHistoryWriteData,
  decodeQuizHistoryFromCloud,
  decodeQuizSessionCompact,
  encodeQuizSessionCompact,
  mergeQuizHistories,
} from './quizHistorySync';
import type { StorageLike } from './storage';
import {
  MAX_QUIZ_HISTORY,
  QUIZ_HISTORY_KEY,
  buildQuizAnswerSnapshots,
  clearQuizHistory,
  computeQuizPerformanceStats,
  loadQuizHistory,
  recordQuizSession,
} from './quizStats';

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

class TightQuotaStorage extends MemoryStorage {
  constructor(private readonly maxBytes: number) {
    super();
  }
  override setItem(key: string, value: string): void {
    if (value.length > this.maxBytes) {
      throw new Error('QuotaExceededError');
    }
    super.setItem(key, value);
  }
}

test('loadQuizHistory handles empty, malformed JSON, and invalid entries safely', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadQuizHistory(storage), []);

  storage.setItem(QUIZ_HISTORY_KEY, '{broken json');
  assert.deepEqual(loadQuizHistory(storage), []);

  storage.setItem(
    QUIZ_HISTORY_KEY,
    JSON.stringify([
      {
        id: 'ok-1',
        completedAt: '2026-11-18T06:00:00.000Z',
        level: 'easy',
        mode: 'random',
        correct: 8,
        total: 10,
        score: 80,
      },
      { id: 'bad-total', completedAt: '2026-11-18T06:00:00.000Z', level: 'easy', mode: 'random', correct: 5, total: 0, score: 0 },
      { id: 'bad-level', completedAt: '2026-11-18T06:00:00.000Z', level: 'expert', mode: 'random', correct: 1, total: 2, score: 50 },
    ])
  );
  const loaded = loadQuizHistory(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, 'ok-1');
  assert.equal(loaded[0].answers, undefined);
});

test('recordQuizSession computes weighted accuracy, trend delta, caps history, and clears cleanly', () => {
  const storage = new MemoryStorage();
  let history = loadQuizHistory(storage);

  history = recordQuizSession(
    history,
    { level: 'all', mode: 'k2r', correct: 6, total: 10, completedAt: '2026-11-18T05:00:00.000Z', id: 's1' },
    storage
  );
  history = recordQuizSession(
    history,
    { level: 'medium', mode: 'ex2k', correct: 18, total: 20, completedAt: '2026-11-18T06:00:00.000Z', id: 's2' },
    storage
  );

  const stats = computeQuizPerformanceStats(history);
  assert.equal(stats.totalSessions, 2);
  assert.equal(stats.totalCorrect, 24);
  assert.equal(stats.totalAnswered, 30);
  assert.equal(stats.overallAccuracyPct, 80); // 24 / 30 = 80%
  assert.equal(stats.bestScore, 90);
  assert.equal(stats.latestScore, 90);
  assert.equal(stats.trendDelta, 30); // 90 - 60 = +30

  // Verify cap at MAX_QUIZ_HISTORY
  for (let i = 0; i < MAX_QUIZ_HISTORY + 5; i++) {
    history = recordQuizSession(
      history,
      { level: 'easy', mode: 'random', correct: 9, total: 10, id: `extra-${i}` },
      storage
    );
  }
  assert.equal(history.length, MAX_QUIZ_HISTORY);
  assert.equal(loadQuizHistory(storage).length, MAX_QUIZ_HISTORY);

  const cleared = clearQuizHistory(storage);
  assert.deepEqual(cleared, []);
  assert.deepEqual(loadQuizHistory(storage), []);
});

test('buildQuizAnswerSnapshots persists ordered answers and handles tight localStorage quota gracefully', () => {
  const itemA: KanjiEntry = {
    id: 'n1',
    k: '計画',
    r: 'けいかく',
    m: 'rencana',
    ex: '夏休みの計画を立てました。',
    exi: 'Menyusun rencana liburan musim panas.',
    lv: 'N4',
    dif: 'easy',
  };
  const itemB: KanjiEntry = {
    id: 'n2',
    k: '経験',
    r: 'けいけん',
    m: 'pengalaman',
    ex: 'いい経験になりました。',
    exi: 'Menjadi pengalaman yang baik.',
    lv: 'N4',
    dif: 'easy',
  };

  const rightList: QuizRecord[] = [
    { no: 2, item: itemB, type: 'k2r', exMeta: null, chosen: itemB, chosenLabel: 'けいけん' },
  ];
  const wrongList: QuizRecord[] = [
    { no: 1, item: itemA, type: 'k2m', exMeta: null, chosen: itemB, chosenLabel: 'pengalaman' },
  ];

  const snapshots = buildQuizAnswerSnapshots(rightList, wrongList);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].no, 1);
  assert.equal(snapshots[0].correct, false);
  assert.equal(snapshots[0].expectedLabel, 'rencana');
  assert.equal(snapshots[0].chosenLabel, 'pengalaman');
  assert.equal(snapshots[1].no, 2);
  assert.equal(snapshots[1].correct, true);
  assert.equal(snapshots[1].expectedLabel, 'けいけん');

  const storage = new MemoryStorage();
  const saved = recordQuizSession(
    [],
    {
      level: 'easy',
      mode: 'random',
      correct: 1,
      total: 2,
      id: 'sess-with-answers',
      completedAt: '2026-11-18T12:00:00.000Z',
      answers: snapshots,
    },
    storage
  );
  assert.equal(saved[0].answers?.length, 2);

  const reloaded = loadQuizHistory(storage);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].answers?.length, 2);
  assert.equal(reloaded[0].answers?.[0].itemK, '計画');
  assert.equal(reloaded[0].answers?.[1].itemK, '経験');

  // Tight quota storage trims oldest session answers first so newest session still persists cleanly
  const tight = new TightQuotaStorage(780);
  let hist = recordQuizSession(
    [],
    {
      level: 'easy',
      mode: 'random',
      correct: 1,
      total: 2,
      id: 'older-sess',
      completedAt: '2026-11-18T11:00:00.000Z',
      answers: snapshots,
    },
    tight
  );
  hist = recordQuizSession(
    hist,
    {
      level: 'easy',
      mode: 'random',
      correct: 1,
      total: 2,
      id: 'newer-sess',
      completedAt: '2026-11-18T12:00:00.000Z',
      answers: snapshots,
    },
    tight
  );
  const reloadedTight = loadQuizHistory(tight);
  assert.equal(reloadedTight.length, 2);
  assert.equal(reloadedTight[0].id, 'newer-sess');
  assert.equal(reloadedTight[0].answers?.length, 2);
  assert.equal(reloadedTight[1].id, 'older-sess');
  assert.equal(reloadedTight[1].answers, undefined);
});

test('compact quiz history cloud codec round-trips all 5 models (including conjugated ex2k) with <1.6KB for 100 questions', () => {
  // Build a real 100-question N4 quiz session spanning all 5 models
  const models = ['k2r', 'k2m', 'm2k', 'r2k', 'ex2k'] as const;
  const rightList: QuizRecord[] = [];
  const wrongList: QuizRecord[] = [];

  for (let i = 0; i < 100; i++) {
    const item = KANJI[i];
    const distractor = KANJI[i + 1];
    const type = models[i % models.length];
    const exMeta = type === 'ex2k' ? analyzeSentenceBlank(item) : null;
    const isCorrect = i % 5 !== 0; // 80 right, 20 wrong
    const chosen = isCorrect ? item : distractor;
    const chosenLabel = dispOf(chosen, type, exMeta);
    const rec: QuizRecord = {
      no: i + 1,
      item,
      type,
      exMeta,
      chosen,
      chosenLabel,
    };
    if (isCorrect) rightList.push(rec);
    else wrongList.push(rec);
  }

  const snapshots = buildQuizAnswerSnapshots(rightList, wrongList);
  assert.equal(snapshots.length, 100);
  assert.equal(snapshots[0].chosenId, KANJI[1].id);

  const session = recordQuizSession(
    [],
    {
      id: 'q-1763500000000-n4abc',
      completedAt: '2026-11-18T12:34:56.000Z',
      level: 'all',
      scopeLabel: 'Level Semua',
      mode: 'random5',
      correct: 80,
      total: 100,
      answers: snapshots,
    },
    null
  )[0];

  const encoded = encodeQuizSessionCompact(session, 'n4');
  assert.ok(encoded, '100-question session must encode cleanly');
  assert.ok(QUIZ_SESSION_TOKEN_PATTERN.test(encoded), 'encoded token must match Firestore Rules regex');
  // Ultra-compact efficiency guarantee: 100 full Q&A snapshots in < 1.6 KB (vs ~22 KB raw JSON)
  assert.ok(
    encoded.length < 1600,
    `Expected compact 100-question token < 1600 bytes, got ${encoded.length}`
  );

  const decoded = decodeQuizSessionCompact(encoded, 'n4');
  assert.ok(decoded);
  assert.equal(decoded.id, session.id);
  assert.equal(decoded.completedAt, session.completedAt);
  assert.equal(decoded.correct, 80);
  assert.equal(decoded.total, 100);
  assert.equal(decoded.score, 80);
  assert.equal(decoded.scopeLabel, 'Level Semua');
  assert.equal(decoded.answers?.length, 100);

  // Verify exact hydration fidelity across every single question (including conjugated ex2k)
  for (let i = 0; i < 100; i++) {
    const orig = snapshots[i];
    const dec: QuizAnswerSnapshot = decoded.answers![i];
    assert.equal(dec.no, orig.no);
    assert.equal(dec.type, orig.type);
    assert.equal(dec.correct, orig.correct);
    assert.equal(dec.itemId, orig.itemId);
    assert.equal(dec.itemK, orig.itemK);
    assert.equal(dec.itemR, orig.itemR);
    assert.equal(dec.itemM, orig.itemM);
    assert.equal(dec.expectedLabel, orig.expectedLabel);
    assert.equal(dec.chosenLabel, orig.chosenLabel);
    assert.equal(dec.chosenM, orig.chosenM);
    assert.equal(dec.ex, orig.ex);
  }
});

test('compact codec supports Irodori chapter ranges, legacy snapshots without chosenId, and cloud/local merge', () => {
  const irItemA = IRODORI_DATA[0];
  const irItemB = IRODORI_DATA[1];
  const irodoriSession = recordQuizSession(
    [],
    {
      id: 'q-ir-1',
      completedAt: '2026-11-18T14:00:00.000Z',
      level: 'all',
      scopeLabel: 'Bab 1–3, 5',
      chapters: [1, 2, 3, 5],
      mode: 'k2m',
      correct: 1,
      total: 2,
      answers: [
        // Legacy snapshot without chosenId (should still reverse-resolve chosenId cleanly)
        {
          no: 1,
          type: 'k2m',
          correct: false,
          itemId: irItemA.id,
          itemK: irItemA.k,
          itemR: irItemA.r,
          itemM: irItemA.m,
          expectedLabel: irItemA.m,
          chosenLabel: irItemB.m,
          chosenM: irItemB.m,
        },
        {
          no: 2,
          type: 'k2m',
          correct: true,
          itemId: irItemB.id,
          itemK: irItemB.k,
          itemR: irItemB.r,
          itemM: irItemB.m,
          expectedLabel: irItemB.m,
          chosenLabel: irItemB.m,
        },
      ],
    },
    null
  )[0];

  const payload = buildQuizHistoryWriteData('userA_123', 'dasar1', [irodoriSession]);
  assert.equal(payload.uid, 'userA_123');
  assert.equal(payload.datasetId, 'dasar1');
  assert.equal(payload.sessions.length, 1);

  const decodedList = decodeQuizHistoryFromCloud(payload.sessions, 'dasar1');
  assert.equal(decodedList.length, 1);
  assert.equal(decodedList[0].scopeLabel, 'Bab 1–3, 5');
  assert.deepEqual(decodedList[0].chapters, [1, 2, 3, 5]);
  assert.equal(decodedList[0].answers?.[0].correct, false);
  assert.equal(decodedList[0].answers?.[0].chosenLabel, irItemB.m);
  assert.equal(decodedList[0].answers?.[1].correct, true);

  // Merge cloud + local: dedup by id, keep richer answers, newest-first, detect needsCloudWrite
  const cloudOld = { ...irodoriSession, id: 's-old', completedAt: '2026-11-18T10:00:00.000Z' };
  const cloudWithoutAnswers = {
    ...irodoriSession,
    id: 's-shared',
    completedAt: '2026-11-18T12:00:00.000Z',
    answers: undefined,
  };
  const localWithAnswers = {
    ...irodoriSession,
    id: 's-shared',
    completedAt: '2026-11-18T12:00:00.000Z',
  };
  const localNew = { ...irodoriSession, id: 's-new', completedAt: '2026-11-18T15:00:00.000Z' };

  const merged = mergeQuizHistories([cloudWithoutAnswers, cloudOld], [localNew, localWithAnswers]);
  assert.equal(merged.needsCloudWrite, true);
  assert.equal(merged.addedFromLocal, 1);
  assert.deepEqual(
    merged.merged.map(s => s.id),
    ['s-new', 's-shared', 's-old']
  );
  assert.equal(merged.merged[1].answers?.length, 2);

  // Already in sync -> needsCloudWrite must be false (0 wasted Firestore writes)
  const alreadySynced = mergeQuizHistories(merged.merged, merged.merged);
  assert.equal(alreadySynced.needsCloudWrite, false);
  assert.equal(alreadySynced.addedFromLocal, 0);
});
