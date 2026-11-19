import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AVATAR_URL_MAX_LENGTH,
  AVATAR_URL_PATTERN,
  DISPLAY_NAME_MAX_LENGTH,
  IRODORI_BOOK_SYNC_RULES,
  KANJI_ID_PATTERN,
  MAX_KANJI_LIST_SIZE,
  UID_MAX_LENGTH,
  UID_PATTERN,
  buildIrodoriProgressWriteData,
  buildUserProfileWriteData,
  buildUserProgressWriteData,
  isValidAvatarUrl,
  isValidFirebaseUid,
  isValidIrodoriBookId,
  markKanjiHard,
  markKanjiMastered,
  mergeIrodoriProgressSets,
  mergeProgressSets,
  sanitizeDisplayName,
  sanitizeIrodoriProgressLists,
  sanitizeProgressLists,
} from './src/utils/progressSync';
import {
  HARD_KEY,
  IRODORI_DASAR2_HARD_KEY,
  IRODORI_DASAR2_LS_KEY,
  IRODORI_HARD_KEY,
  IRODORI_LS_KEY,
  IRODORI_PEMULA_HARD_KEY,
  IRODORI_PEMULA_LS_KEY,
  LS_KEY,
  OWNER_UID_KEY,
  clearStoredProgress,
  type StorageLike,
} from './src/utils/storage';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const BLUEPRINT_PATH = path.resolve(process.cwd(), 'firebase-blueprint.json');

interface MockAuth {
  uid: string;
  token: { email_verified: boolean };
}

interface MockProgressDoc {
  uid?: unknown;
  mastered?: unknown;
  hard?: unknown;
  displayName?: unknown;
  avatarUrl?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  [extra: string]: unknown;
}

const SERVER_TIME = Symbol('request.time');

function simulateRulesDecision(
  op: 'get' | 'list' | 'create' | 'update' | 'delete',
  auth: MockAuth | null,
  pathUserId: string,
  incoming?: MockProgressDoc,
  existing?: MockProgressDoc
): 'ALLOW' | 'PERMISSION_DENIED' {
  const isSignedIn = auth !== null;
  const isVerifiedUser = isSignedIn && auth.token.email_verified === true;
  const isValidId = (id: unknown): id is string =>
    typeof id === 'string' && id.length >= 1 && id.length <= UID_MAX_LENGTH && UID_PATTERN.test(id);
  const isOwner = isSignedIn && auth.uid === pathUserId;

  if (op === 'list') return 'PERMISSION_DENIED';
  if (op === 'get') {
    return isSignedIn && isValidId(pathUserId) && isOwner ? 'ALLOW' : 'PERMISSION_DENIED';
  }
  if (op === 'delete') {
    return isVerifiedUser && isValidId(pathUserId) && isOwner ? 'ALLOW' : 'PERMISSION_DENIED';
  }

  if (!incoming || !isVerifiedUser || !isValidId(pathUserId) || !isOwner) {
    return 'PERMISSION_DENIED';
  }

  const requiredKeys = new Set(['uid', 'mastered', 'hard', 'createdAt', 'updatedAt']);
  const allowedKeys = new Set([
    'uid',
    'mastered',
    'hard',
    'displayName',
    'avatarUrl',
    'createdAt',
    'updatedAt',
  ]);
  const keys = Object.keys(incoming);
  if (![...requiredKeys].every(k => Object.prototype.hasOwnProperty.call(incoming, k))) {
    return 'PERMISSION_DENIED';
  }
  if (!keys.every(k => allowedKeys.has(k))) {
    return 'PERMISSION_DENIED';
  }
  if (!isValidId(incoming.uid) || incoming.uid !== auth.uid) {
    return 'PERMISSION_DENIED';
  }
  if (
    incoming.displayName !== undefined &&
    (typeof incoming.displayName !== 'string' ||
      incoming.displayName.length > DISPLAY_NAME_MAX_LENGTH)
  ) {
    return 'PERMISSION_DENIED';
  }
  if (incoming.avatarUrl !== undefined && !isValidAvatarUrl(incoming.avatarUrl)) {
    return 'PERMISSION_DENIED';
  }

  const commaJoinedPattern =
    /^n([1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)(,n([1-9]|[1-9][0-9]|[1-4][0-9]{2}|500))*$/;
  const pipeJoinedPattern =
    /^n([1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)(\|n([1-9]|[1-9][0-9]|[1-4][0-9]{2}|500))*$/;

  // Mirrors firestore.rules isValidKanjiList() verbatim: validates EVERY element via
  // string type enforcement, uniqueness (toSet), and dual-separator join (',' and '|').
  const checkList = (arr: unknown): arr is string[] => {
    if (!Array.isArray(arr) || arr.length > MAX_KANJI_LIST_SIZE) return false;
    if (new Set(arr).size !== arr.length) return false;
    if (arr.length === 0) return true;
    if (!arr.every(el => typeof el === 'string')) return false;
    const first = arr[0];
    if (first.length < 2 || first.length > 4 || !KANJI_ID_PATTERN.test(first)) return false;
    const commaJoined = arr.join(',');
    const pipeJoined = arr.join('|');
    return (
      commaJoined.length <= 2500 &&
      commaJoinedPattern.test(commaJoined) &&
      pipeJoinedPattern.test(pipeJoined)
    );
  };

  if (!checkList(incoming.mastered) || !checkList(incoming.hard)) {
    return 'PERMISSION_DENIED';
  }

  // Mutual exclusivity between mastered and hard (mirrors toSet().intersection(...).size() == 0)
  const hardSet = new Set(incoming.hard);
  if (incoming.mastered.some(id => hardSet.has(id))) {
    return 'PERMISSION_DENIED';
  }

  if (op === 'create') {
    if (
      incoming.uid === pathUserId &&
      incoming.createdAt === SERVER_TIME &&
      incoming.updatedAt === SERVER_TIME
    ) {
      return 'ALLOW';
    }
    return 'PERMISSION_DENIED';
  }

  if (!existing) return 'PERMISSION_DENIED';
  const changedKeys = keys.filter(k => incoming[k] !== existing[k]);
  const progressKeys = new Set(['mastered', 'hard', 'updatedAt']);
  const profileKeys = new Set(['displayName', 'avatarUrl', 'updatedAt']);
  const combinedKeys = new Set(['mastered', 'hard', 'displayName', 'avatarUrl', 'updatedAt']);
  const validAction =
    changedKeys.every(k => progressKeys.has(k)) ||
    changedKeys.every(k => profileKeys.has(k)) ||
    changedKeys.every(k => combinedKeys.has(k));

  if (!validAction) {
    return 'PERMISSION_DENIED';
  }
  if (
    incoming.uid === existing.uid &&
    incoming.createdAt === existing.createdAt &&
    incoming.updatedAt === SERVER_TIME
  ) {
    return 'ALLOW';
  }
  return 'PERMISSION_DENIED';
}

test('firestore.rules file implements all Eight Pillars gates and matches firebase-blueprint.json', () => {
  const rulesText = fs.readFileSync(RULES_PATH, 'utf8');
  const blueprint = JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf8')) as {
    entities: {
      UserProgress: {
        properties: {
          uid: { maxLength: number };
          displayName: { maxLength: number };
          avatarUrl: { maxLength: number };
        };
      };
    };
    firestore: Record<string, unknown>;
  };

  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('match /{document=**}'));
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('allow list: if false;'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes('isValidUserProgress(incoming())'));
  assert.ok(rulesText.includes(`id.size() <= ${blueprint.entities.UserProgress.properties.uid.maxLength}`));
  assert.ok(
    rulesText.includes(
      `data.displayName.size() <= ${blueprint.entities.UserProgress.properties.displayName.maxLength}`
    )
  );
  assert.ok(
    rulesText.includes(
      `data.avatarUrl.size() <= ${blueprint.entities.UserProgress.properties.avatarUrl.maxLength}`
    )
  );
  assert.ok(rulesText.includes('arr.toSet().size() == arr.size()'));
  assert.ok(rulesText.includes("arr.join(',').size() <= 2500"));
  assert.ok(rulesText.includes("arr.join(',').matches("));
  assert.ok(rulesText.includes("arr.join('|').matches("));
  assert.ok(rulesText.includes('data.mastered.toSet().intersection(data.hard.toSet()).size() == 0'));
  assert.ok(Object.prototype.hasOwnProperty.call(blueprint.firestore, '/users/{userId}'));
  assert.ok(
    Object.prototype.hasOwnProperty.call(
      blueprint.firestore,
      '/users/{userId}/irodoriProgress/{bookId}'
    )
  );
  assert.ok(rulesText.includes('match /irodoriProgress/{bookId}'));
  assert.ok(rulesText.includes('isValidIrodoriBookId(bookId)'));
  assert.ok(rulesText.includes('isValidIrodoriPemulaList(arr)'));
  assert.ok(rulesText.includes('isValidIrodoriDasar1List(arr)'));
  assert.ok(rulesText.includes('isValidIrodoriDasar2List(arr)'));
  assert.ok(rulesText.includes('isValidIrodoriProgress(incoming(), bookId)'));
  assert.ok(rulesText.includes('exists(/databases/$(database)/documents/users/$(userId))'));
});

test('Dirty Dozen adversarial payloads and unsafe profile inputs result in PERMISSION_DENIED', () => {
  const userA: MockAuth = { uid: 'userA_123', token: { email_verified: true } };
  const userB: MockAuth = { uid: 'userB_456', token: { email_verified: true } };
  const unverifiedA: MockAuth = { uid: 'userA_123', token: { email_verified: false } };

  const validExisting: MockProgressDoc = {
    uid: 'userA_123',
    mastered: ['n1'],
    hard: ['n2'],
    createdAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
  };

  // 1-12 Dirty Dozen
  assert.equal(simulateRulesDecision('get', null, 'userA_123'), 'PERMISSION_DENIED');
  assert.equal(
    simulateRulesDecision('create', null, 'userA_123', { ...validExisting }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', unverifiedA, 'userA_123', { ...validExisting }),
    'PERMISSION_DENIED'
  );
  assert.equal(simulateRulesDecision('get', userB, 'userA_123'), 'PERMISSION_DENIED');
  assert.equal(simulateRulesDecision('list', userA, 'userA_123'), 'PERMISSION_DENIED');
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', { ...validExisting, uid: 'userB_456' }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision(
      'create',
      { uid: 'a'.repeat(200), token: { email_verified: true } },
      'a'.repeat(200),
      { ...validExisting, uid: 'a'.repeat(200) }
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', { ...validExisting, isAdmin: true }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision(
      'update',
      userA,
      'userA_123',
      { ...validExisting, role: 'admin' },
      validExisting
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      uid: 'userA_123',
      mastered: ['n1'],
      createdAt: SERVER_TIME,
      updatedAt: SERVER_TIME,
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision(
      'update',
      userA,
      'userA_123',
      { ...validExisting, createdAt: '1999-01-01' },
      validExisting
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      updatedAt: '2026-01-01T00:00:00Z',
    }),
    'PERMISSION_DENIED'
  );
  const oversized = Array.from({ length: 501 }, (_, i) => `n${i + 1}`);
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', { ...validExisting, mastered: oversized }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['<script>alert(1)</script>'],
    }),
    'PERMISSION_DENIED'
  );

  // Full-array hardening: malicious or invalid elements at index > 0 MUST be rejected
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['n1', 'n2', '<script>alert(1)</script>'],
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('update', userA, 'userA_123', {
      ...validExisting,
      hard: ['n2', 'n3', '<img src=x onerror=alert(1)>'],
    }, validExisting),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['n1', 'n2,n3'], // comma smuggling attempt
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['n1', 'n2|n3'], // pipe smuggling attempt
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['n1', 123], // non-string element at index 1
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['n1', 'n501'], // out-of-range kanji ID
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['n1', 'n1'], // duplicate kanji ID
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision('create', userA, 'userA_123', {
      ...validExisting,
      mastered: ['n1', 'n2'],
      hard: ['n2'], // overlap between mastered & hard
    }),
    'PERMISSION_DENIED'
  );

  // Unsafe profile XSS / SVG / oversized payload rejection
  assert.equal(
    simulateRulesDecision(
      'update',
      userA,
      'userA_123',
      { ...validExisting, avatarUrl: 'javascript:alert(1)' },
      validExisting
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision(
      'update',
      userA,
      'userA_123',
      { ...validExisting, avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
      validExisting
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateRulesDecision(
      'update',
      userA,
      'userA_123',
      { ...validExisting, displayName: 'x'.repeat(61) },
      validExisting
    ),
    'PERMISSION_DENIED'
  );

  // Valid profile & progress updates pass
  assert.equal(
    simulateRulesDecision(
      'update',
      userA,
      'userA_123',
      {
        ...validExisting,
        displayName: 'Rasen',
        avatarUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      },
      validExisting
    ),
    'ALLOW'
  );
});

test('progressSync enforces blueprint bounds, sanitization, profile checks, and merging', () => {
  assert.equal(isValidFirebaseUid('abc_XYZ-123'), true);
  assert.equal(isValidFirebaseUid('bad uid!'), false);
  assert.equal(isValidFirebaseUid('a'.repeat(129)), false);

  assert.equal(sanitizeDisplayName('  Rasen  '), 'Rasen');
  assert.equal(sanitizeDisplayName('a'.repeat(100)).length, 60);
  assert.equal(AVATAR_URL_PATTERN.test('https://example.com/a.png'), true);
  assert.equal(AVATAR_URL_PATTERN.test('data:image/webp;base64,UklGRh4='), true);
  assert.equal(AVATAR_URL_PATTERN.test('javascript:alert(1)'), false);
  assert.equal(isValidAvatarUrl('https://' + 'a'.repeat(AVATAR_URL_MAX_LENGTH)), false);
  assert.throws(() => buildUserProfileWriteData('Rasen', 'http://insecure.example/a.png'));
  assert.deepEqual(buildUserProfileWriteData('  Rasen ', 'https://example.com/a.png'), {
    displayName: 'Rasen',
    avatarUrl: 'https://example.com/a.png',
  });

  const clean = sanitizeProgressLists(
    ['n1', 'n1', 'invalid_id', 42, 'n2'],
    ['n2', 'n3', 'n9999', 'n4']
  );
  assert.deepEqual(clean.mastered, ['n1', 'n2']);
  assert.deepEqual(clean.hard, ['n3', 'n4']);

  const payload = buildUserProgressWriteData('user_01', ['n5'], ['n6', 'n5']);
  assert.deepEqual(payload, { uid: 'user_01', mastered: ['n5'], hard: ['n6'] });

  const merged = mergeProgressSets(
    new Set(['n1', 'n2']),
    new Set(['n3']),
    ['n3', 'n4'],
    ['n1', 'n5']
  );
  assert.deepEqual([...merged.mastered].sort(), ['n1', 'n2', 'n3', 'n4']);
  assert.deepEqual([...merged.hard], ['n5']);
  assert.equal(merged.addedFromSecondary, 3);

  // Mutual exclusivity between Hafal (mastered) and Sulit (hard)
  const afterHard = markKanjiHard(new Set(['n1', 'n2']), new Set(['n3']), 'n1');
  assert.equal(afterHard.nextMastered.has('n1'), false);
  assert.equal(afterHard.nextHard.has('n1'), true);
  assert.equal(afterHard.nextMastered.has('n2'), true);

  const afterMastered = markKanjiMastered(afterHard.nextMastered, afterHard.nextHard, 'n1');
  assert.equal(afterMastered.nextMastered.has('n1'), true);
  assert.equal(afterMastered.nextHard.has('n1'), false);
  assert.equal(afterMastered.isNewMastered, true);
});

interface MockIrodoriDoc {
  uid?: unknown;
  bookId?: unknown;
  mastered?: unknown;
  hard?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  [extra: string]: unknown;
}

function simulateIrodoriRulesDecision(
  op: 'get' | 'list' | 'create' | 'update' | 'delete',
  auth: MockAuth | null,
  pathUserId: string,
  pathBookId: string,
  parentUserDocExists: boolean,
  incoming?: MockIrodoriDoc,
  existing?: MockIrodoriDoc
): 'ALLOW' | 'PERMISSION_DENIED' {
  const isSignedIn = auth !== null;
  const isVerifiedUser = isSignedIn && auth.token.email_verified === true;
  const isValidId = (id: unknown): id is string =>
    typeof id === 'string' && id.length >= 1 && id.length <= UID_MAX_LENGTH && UID_PATTERN.test(id);
  const isOwner = isSignedIn && auth.uid === pathUserId;

  if (op === 'list') return 'PERMISSION_DENIED';
  if (!isValidId(pathUserId) || !isValidIrodoriBookId(pathBookId)) {
    return 'PERMISSION_DENIED';
  }
  if (op === 'get') {
    return isSignedIn && isOwner && parentUserDocExists ? 'ALLOW' : 'PERMISSION_DENIED';
  }
  if (op === 'delete') {
    return isVerifiedUser && isOwner && parentUserDocExists ? 'ALLOW' : 'PERMISSION_DENIED';
  }

  if (!incoming || !isVerifiedUser || !isOwner || !parentUserDocExists) {
    return 'PERMISSION_DENIED';
  }

  const requiredKeys = new Set(['uid', 'bookId', 'mastered', 'hard', 'createdAt', 'updatedAt']);
  const keys = Object.keys(incoming);
  if (
    keys.length !== requiredKeys.size ||
    !keys.every(k => requiredKeys.has(k))
  ) {
    return 'PERMISSION_DENIED';
  }
  if (!isValidId(incoming.uid) || incoming.uid !== auth.uid || incoming.bookId !== pathBookId) {
    return 'PERMISSION_DENIED';
  }

  const rule = IRODORI_BOOK_SYNC_RULES[pathBookId];
  const rawBody = rule.pattern.source.slice(1, -1);
  const commaJoinedPattern = new RegExp(`^${rawBody}(,${rawBody})*$`);
  const pipeJoinedPattern = new RegExp(`^${rawBody}(\\|${rawBody})*$`);

  const checkIrodoriList = (arr: unknown): arr is string[] => {
    if (!Array.isArray(arr) || arr.length > rule.maxSize) return false;
    if (new Set(arr).size !== arr.length) return false;
    if (arr.length === 0) return true;
    if (!arr.every(el => typeof el === 'string')) return false;
    if (!rule.pattern.test(arr[0])) return false;
    const commaJoined = arr.join(',');
    const pipeJoined = arr.join('|');
    return (
      commaJoined.length <= rule.maxJoinedLength &&
      commaJoinedPattern.test(commaJoined) &&
      pipeJoinedPattern.test(pipeJoined)
    );
  };

  if (!checkIrodoriList(incoming.mastered) || !checkIrodoriList(incoming.hard)) {
    return 'PERMISSION_DENIED';
  }

  const hardSet = new Set(incoming.hard);
  if (incoming.mastered.some(id => hardSet.has(id))) {
    return 'PERMISSION_DENIED';
  }

  if (op === 'create') {
    return incoming.uid === pathUserId &&
      incoming.createdAt === SERVER_TIME &&
      incoming.updatedAt === SERVER_TIME
      ? 'ALLOW'
      : 'PERMISSION_DENIED';
  }

  if (!existing) return 'PERMISSION_DENIED';
  const changedKeys = keys.filter(k => incoming[k] !== existing[k]);
  const allowedUpdateKeys = new Set(['mastered', 'hard', 'updatedAt']);
  if (
    !changedKeys.every(k => allowedUpdateKeys.has(k)) ||
    incoming.uid !== existing.uid ||
    incoming.bookId !== existing.bookId ||
    incoming.createdAt !== existing.createdAt ||
    incoming.updatedAt !== SERVER_TIME
  ) {
    return 'PERMISSION_DENIED';
  }
  return 'ALLOW';
}

test('Irodori subcollection rules enforce Master Gate, per-book full-array validation, and isolation', () => {
  const userA: MockAuth = { uid: 'userA_123', token: { email_verified: true } };
  const userB: MockAuth = { uid: 'userB_456', token: { email_verified: true } };
  const unverifiedA: MockAuth = { uid: 'userA_123', token: { email_verified: false } };

  const validPemula: MockIrodoriDoc = {
    uid: 'userA_123',
    bookId: 'pemula',
    mastered: ['irp1', 'irp1136'],
    hard: ['irp2'],
    createdAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
  };
  const validDasar1: MockIrodoriDoc = {
    uid: 'userA_123',
    bookId: 'dasar1',
    mastered: ['ir1', 'ir1067'],
    hard: ['ir2'],
    createdAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
  };
  const validDasar2: MockIrodoriDoc = {
    uid: 'userA_123',
    bookId: 'dasar2',
    mastered: ['ir2_1', 'ir2_1288'],
    hard: ['ir2_2'],
    createdAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
  };

  // Master Gate: missing parent /users/{userId} MUST deny
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'pemula', false, validPemula),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('get', userA, 'userA_123', 'pemula', false),
    'PERMISSION_DENIED'
  );

  // Unauth / unverified / cross-user / list / invalid bookId MUST deny
  assert.equal(
    simulateIrodoriRulesDecision('get', null, 'userA_123', 'pemula', true),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', unverifiedA, 'userA_123', 'pemula', true, validPemula),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('get', userB, 'userA_123', 'pemula', true),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('list', userA, 'userA_123', 'pemula', true),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'dasar3', true, {
      ...validPemula,
      bookId: 'dasar3',
    }),
    'PERMISSION_DENIED'
  );

  // Full-array XSS, separator smuggling, cross-book prefix spoofing, and out-of-range IDs MUST deny
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'pemula', true, {
      ...validPemula,
      mastered: ['irp1', 'irp2', '<script>alert(1)</script>'],
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'pemula', true, {
      ...validPemula,
      mastered: ['irp1', 'irp2,irp3'],
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'pemula', true, {
      ...validPemula,
      mastered: ['irp1', 'ir1'], // dasar1 ID inside pemula
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'pemula', true, {
      ...validPemula,
      mastered: ['irp1', 'irp1137'], // out of range (> 1136)
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'dasar1', true, {
      ...validDasar1,
      mastered: ['ir1', 'ir1068'], // out of range (> 1067)
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'dasar2', true, {
      ...validDasar2,
      mastered: ['ir2_1', 'ir2_1289'], // out of range (> 1288)
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'dasar2', true, {
      ...validDasar2,
      mastered: ['ir2_1', 'ir2_2'],
      hard: ['ir2_2'], // overlap
    }),
    'PERMISSION_DENIED'
  );

  // Legitimate operations across all 3 books MUST succeed
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'pemula', true, validPemula),
    'ALLOW'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'dasar1', true, validDasar1),
    'ALLOW'
  );
  assert.equal(
    simulateIrodoriRulesDecision('create', userA, 'userA_123', 'dasar2', true, validDasar2),
    'ALLOW'
  );
  assert.equal(
    simulateIrodoriRulesDecision(
      'update',
      userA,
      'userA_123',
      'dasar2',
      true,
      { ...validDasar2, mastered: ['ir2_1', 'ir2_2', 'ir2_1288'], hard: [] },
      validDasar2
    ),
    'ALLOW'
  );
  // Attempting to mutate immutable bookId MUST deny
  assert.equal(
    simulateIrodoriRulesDecision(
      'update',
      userA,
      'userA_123',
      'dasar2',
      true,
      { ...validDasar2, bookId: 'pemula' },
      validDasar2
    ),
    'PERMISSION_DENIED'
  );
});

test('Irodori progressSync helpers sanitize, build payloads, merge, and clear storage cleanly', () => {
  const cleanPemula = sanitizeIrodoriProgressLists(
    'pemula',
    ['irp1', 'irp1', 'n1', 'ir1', 'irp1137', '<script>', 'irp1136'],
    ['irp1', 'irp2', 'irp9999', 'ir2_1']
  );
  assert.deepEqual(cleanPemula.mastered, ['irp1', 'irp1136']);
  assert.deepEqual(cleanPemula.hard, ['irp2']);

  const payload = buildIrodoriProgressWriteData(
    'user_01',
    'dasar2',
    ['ir2_1', 'ir2_1288'],
    ['ir2_1', 'ir2_5']
  );
  assert.deepEqual(payload, {
    uid: 'user_01',
    bookId: 'dasar2',
    mastered: ['ir2_1', 'ir2_1288'],
    hard: ['ir2_5'],
  });

  const merged = mergeIrodoriProgressSets(
    'dasar1',
    new Set(['ir1', 'ir2']),
    new Set(['ir3']),
    ['ir3', 'ir4', 'irp1'], // irp1 ignored (wrong book)
    ['ir1', 'ir5']
  );
  assert.deepEqual([...merged.mastered].sort(), ['ir1', 'ir2', 'ir3', 'ir4']);
  assert.deepEqual([...merged.hard], ['ir5']);
  assert.equal(merged.addedFromSecondary, 3);

  // Verify clearStoredProgress clears both N4 and all 3 Irodori books on sign-out
  const mem = new Map<string, string>([
    [LS_KEY, '["n1"]'],
    [HARD_KEY, '["n2"]'],
    [IRODORI_PEMULA_LS_KEY, '["irp1"]'],
    [IRODORI_PEMULA_HARD_KEY, '["irp2"]'],
    [IRODORI_LS_KEY, '["ir1"]'],
    [IRODORI_HARD_KEY, '["ir2"]'],
    [IRODORI_DASAR2_LS_KEY, '["ir2_1"]'],
    [IRODORI_DASAR2_HARD_KEY, '["ir2_2"]'],
    [OWNER_UID_KEY, 'user_01'],
  ]);
  const mockStorage: StorageLike = {
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    },
    removeItem: k => {
      mem.delete(k);
    },
  };
  clearStoredProgress(mockStorage);
  assert.equal(mem.size, 0);
});
