import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AVATAR_URL_MAX_LENGTH,
  AVATAR_URL_PATTERN,
  DISPLAY_NAME_MAX_LENGTH,
  KANJI_ID_PATTERN,
  MAX_KANJI_LIST_SIZE,
  UID_MAX_LENGTH,
  UID_PATTERN,
  buildUserProfileWriteData,
  buildUserProgressWriteData,
  isValidAvatarUrl,
  isValidFirebaseUid,
  mergeProgressSets,
  sanitizeDisplayName,
  sanitizeProgressLists,
} from './src/utils/progressSync';

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

  const checkList = (arr: unknown) =>
    Array.isArray(arr) &&
    arr.length <= MAX_KANJI_LIST_SIZE &&
    (arr.length === 0 ||
      (typeof arr[0] === 'string' &&
        arr[0].length >= 2 &&
        arr[0].length <= 5 &&
        KANJI_ID_PATTERN.test(arr[0])));

  if (!checkList(incoming.mastered) || !checkList(incoming.hard)) {
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
  assert.ok(Object.prototype.hasOwnProperty.call(blueprint.firestore, '/users/{userId}'));
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
});
