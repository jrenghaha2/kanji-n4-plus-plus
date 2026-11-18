import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  HARD_KEY,
  LS_KEY,
  commitProgressTransaction,
  safeLoadSet,
  validateAndParseBackup,
  type StorageLike,
} from './storage';

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  public failOnSet = false;
  public corruptVerify = false;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failOnSet) {
      throw new Error('QuotaExceededError');
    }
    this.data.set(key, this.corruptVerify ? '[]' : value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

test('validateAndParseBackup rejects arbitrary JSON objects and malformed backups', () => {
  assert.throws(() => validateAndParseBackup('not json'), /JSON/);
  assert.throws(() => validateAndParseBackup('[]'), /objek backup/);
  assert.throws(() => validateAndParseBackup('{}'), /valid/);
  assert.throws(() => validateAndParseBackup('{"foo": 123, "bar": "baz"}'), /valid/);
  assert.throws(() => validateAndParseBackup('{"mastered": "n3"}'), /valid/);
  assert.throws(() => validateAndParseBackup('{"mastered": ["n3"], "extra": true}'), /valid/);
  assert.throws(() => validateAndParseBackup('{"mastered": ["n3"], "hard": [], "extra": true}'), /tidak dikenali/);
  assert.throws(() => validateAndParseBackup('{"mastered": ["fake1"], "hard": []}'), /tidak mengandung ID/);
  assert.throws(
    () => validateAndParseBackup(JSON.stringify({ app: 'other-app', version: 1, mastered: [], hard: [] })),
    /Identitas aplikasi/
  );
  assert.throws(
    () => validateAndParseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 99, mastered: [], hard: [] })),
    /Versi skema/
  );
  assert.throws(
    () => validateAndParseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 1 })),
    /harus memiliki array/
  );
});

test('validateAndParseBackup accepts valid v1 backup, flags empty backups and unrecognized IDs', () => {
  const emptyPayload = JSON.stringify({
    app: BACKUP_APP_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-11-18T00:00:00.000Z',
    mastered: [],
    hard: [],
  });
  const emptyParsed = validateAndParseBackup(emptyPayload);
  assert.equal(emptyParsed.isEmptyBackup, true);
  assert.deepEqual(emptyParsed.rejectedIds, []);

  const mixedPayload = JSON.stringify({
    app: BACKUP_APP_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-11-18T00:00:00.000Z',
    mastered: ['n3', 'unknown_999'],
    hard: ['n4', 'bad_id'],
  });
  const mixedParsed = validateAndParseBackup(mixedPayload);
  assert.equal(mixedParsed.isEmptyBackup, false);
  assert.deepEqual(mixedParsed.impMastered, ['n3']);
  assert.deepEqual(mixedParsed.impHard, ['n4']);
  assert.deepEqual(mixedParsed.rejectedIds, ['unknown_999', 'bad_id']);
});

test('commitProgressTransaction checks write success and rolls back cleanly on storage failure', () => {
  const storage = new MemoryStorage();
  const initialM = new Set(['n3', 'n4']);
  const initialH = new Set(['n6']);
  const firstRes = commitProgressTransaction(initialM, initialH, storage);
  assert.equal(firstRes.ok, true);
  assert.deepEqual([...safeLoadSet(LS_KEY, undefined, storage)], ['n3', 'n4']);
  assert.deepEqual([...safeLoadSet(HARD_KEY, undefined, storage)], ['n6']);

  // Simulate QuotaExceededError
  storage.failOnSet = true;
  const failRes = commitProgressTransaction(new Set(['n11']), new Set(['n13']), storage);
  assert.equal(failRes.ok, false);
  assert.ok(failRes.error);

  // Previous data in storage must remain completely intact
  storage.failOnSet = false;
  assert.deepEqual([...safeLoadSet(LS_KEY, undefined, storage)], ['n3', 'n4']);
  assert.deepEqual([...safeLoadSet(HARD_KEY, undefined, storage)], ['n6']);

  // Simulate silent write corruption
  storage.corruptVerify = true;
  const corruptRes = commitProgressTransaction(new Set(['n11']), new Set(), storage);
  assert.equal(corruptRes.ok, false);
});
