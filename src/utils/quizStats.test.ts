import test from 'node:test';
import assert from 'node:assert/strict';
import type { StorageLike } from './storage';
import {
  MAX_QUIZ_HISTORY,
  QUIZ_HISTORY_KEY,
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
