import test from 'node:test';
import assert from 'node:assert/strict';
import type { KanjiEntry, QuizRecord } from '../types/kanji';
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
