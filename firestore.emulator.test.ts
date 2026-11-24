import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;

function parseEmulatorHost(hostSpec: string): { host: string; port: number } {
  const [host, portStr] = hostSpec.split(':');
  return {
    host: host || '127.0.0.1',
    port: Number(portStr) || 8080,
  };
}

/**
 * Real Firestore Security Rules integration suite powered by @firebase/rules-unit-testing.
 *
 * Run locally or in CI with Java 11+ installed:
 *   npm run test:rules:emulator
 *   (executes: firebase emulators:exec --only firestore "npx tsx --test firestore.emulator.test.ts")
 */
test(
  'Firestore Emulator executes real firestore.rules against full-array, XSS, and Dirty Dozen payloads',
  {
    skip: !EMULATOR_HOST
      ? 'FIRESTORE_EMULATOR_HOST is not set; run via `npm run test:rules:emulator` (requires Java 11+ & Firebase Emulator)'
      : false,
  },
  async () => {
    const { host, port } = parseEmulatorHost(EMULATOR_HOST!);
    const rules = fs.readFileSync(RULES_PATH, 'utf8');

    const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
      projectId: 'demo-n4-kanji-rules-test',
      firestore: { host, port, rules },
    });

    try {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      const unverifiedDb = testEnv
        .authenticatedContext('userA_123', { email_verified: false })
        .firestore();
      const userADb = testEnv
        .authenticatedContext('userA_123', { email_verified: true })
        .firestore();
      const userBDb = testEnv
        .authenticatedContext('userB_456', { email_verified: true })
        .firestore();

      const validCreatePayload = () => ({
        uid: 'userA_123',
        mastered: ['n1', 'n2', 'n650'],
        hard: ['n3', 'n4'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 1. Unauthenticated / unverified / cross-user / list attacks MUST fail
      await assertFails(getDoc(doc(unauthDb, 'users', 'userA_123')));
      await assertFails(setDoc(doc(unauthDb, 'users', 'userA_123'), validCreatePayload()));
      await assertFails(setDoc(doc(unverifiedDb, 'users', 'userA_123'), validCreatePayload()));
      await assertFails(getDocs(collection(userADb, 'users')));

      // 2. Full-array validation attacks (index > 0) MUST fail
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          mastered: ['n1', 'n2', '<script>alert(1)</script>'],
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          mastered: ['n1', 'n2,n3'], // comma smuggling
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          mastered: ['n1', 'n2|n3'], // pipe smuggling
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          mastered: ['n1', 42], // non-string element
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          mastered: ['n1', 'n651'], // out-of-range ID (> 650)
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          mastered: ['n1', 'n1'], // duplicate ID
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          mastered: ['n1'],
          hard: ['n1'], // overlap between mastered & hard
        })
      );

      // 3. Shadow field & timestamp spoofing MUST fail
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          isAdmin: true,
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123'), {
          ...validCreatePayload(),
          createdAt: new Date('2020-01-01T00:00:00Z'),
        })
      );

      // 4. Master Gate: creating Irodori subcollection doc BEFORE parent /users/{uid} exists MUST fail
      const validIrodoriPayload = (bookId: 'pemula' | 'dasar1' | 'dasar2', mastered: string[], hard: string[]) => ({
        uid: 'userA_123',
        bookId,
        mastered,
        hard,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await assertFails(
        setDoc(
          doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'pemula'),
          validIrodoriPayload('pemula', ['irp1'], ['irp2'])
        )
      );

      // 5. Legitimate create, get, progress update, profile update on /users/{uid} MUST succeed
      await assertSucceeds(setDoc(doc(userADb, 'users', 'userA_123'), validCreatePayload()));
      await assertSucceeds(getDoc(doc(userADb, 'users', 'userA_123')));
      await assertFails(getDoc(doc(userBDb, 'users', 'userA_123')));

      await assertSucceeds(
        updateDoc(doc(userADb, 'users', 'userA_123'), {
          mastered: ['n1', 'n2', 'n3'],
          hard: ['n4'],
          updatedAt: serverTimestamp(),
        })
      );

      await assertFails(
        updateDoc(doc(userADb, 'users', 'userA_123'), {
          mastered: ['n1', 'n2', '<script>alert(1)</script>'],
          updatedAt: serverTimestamp(),
        })
      );

      await assertFails(
        updateDoc(doc(userADb, 'users', 'userA_123'), {
          avatarUrl: 'javascript:alert(1)',
          updatedAt: serverTimestamp(),
        })
      );

      await assertSucceeds(
        updateDoc(doc(userADb, 'users', 'userA_123'), {
          displayName: 'Rasen',
          avatarUrl: 'https://example.com/avatar.png',
          updatedAt: serverTimestamp(),
        })
      );

      // 6. Irodori subcollection /users/{uid}/irodoriProgress/{bookId} rules
      await assertFails(getDocs(collection(userADb, 'users', 'userA_123', 'irodoriProgress')));
      await assertFails(
        setDoc(
          doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'dasar3'),
          {
            uid: 'userA_123',
            bookId: 'dasar3',
            mastered: ['irp1'],
            hard: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        )
      );
      await assertFails(
        setDoc(
          doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'pemula'),
          validIrodoriPayload('pemula', ['irp1', 'irp2', '<script>alert(1)</script>'], [])
        )
      );
      await assertFails(
        setDoc(
          doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'pemula'),
          validIrodoriPayload('pemula', ['irp1', 'ir1'], []) // wrong book prefix
        )
      );

      await assertSucceeds(
        setDoc(
          doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'pemula'),
          validIrodoriPayload('pemula', ['irp1', 'irp1136'], ['irp2'])
        )
      );
      await assertSucceeds(
        setDoc(
          doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'dasar1'),
          validIrodoriPayload('dasar1', ['ir1', 'ir1067'], ['ir2'])
        )
      );
      await assertSucceeds(
        setDoc(
          doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'dasar2'),
          validIrodoriPayload('dasar2', ['ir2_1', 'ir2_1288'], ['ir2_2'])
        )
      );

      await assertSucceeds(getDoc(doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'dasar2')));
      await assertFails(getDoc(doc(userBDb, 'users', 'userA_123', 'irodoriProgress', 'dasar2')));

      await assertSucceeds(
        updateDoc(doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'dasar2'), {
          mastered: ['ir2_1', 'ir2_2', 'ir2_1288'],
          hard: [],
          updatedAt: serverTimestamp(),
        })
      );
      await assertSucceeds(
        deleteDoc(doc(userADb, 'users', 'userA_123', 'irodoriProgress', 'dasar2'))
      );

      // 7. QuizHistory subcollection /users/{uid}/quizHistory/{datasetId} rules
      const validQuizToken1 = 'q-1|2026-11-18T12:00:00.000Z|all|random|8|10|80||1:5:n1;2:1:n2:n3';
      const validQuizToken2 = 'q-2|2026-11-18T13:00:00.000Z|all|k2m|9|10|90|1.2.5|1:6:ir1;2:1:ir2:ir3';

      await assertFails(getDocs(collection(userADb, 'users', 'userA_123', 'quizHistory')));
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123', 'quizHistory', 'n4'), {
          uid: 'userA_123',
          datasetId: 'n4',
          sessions: [validQuizToken1, '<script>alert(1)</script>'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await assertFails(
        setDoc(doc(userADb, 'users', 'userA_123', 'quizHistory', 'n4'), {
          uid: 'userA_123',
          datasetId: 'n4',
          sessions: [validQuizToken1, `${validQuizToken2},${validQuizToken2}`],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await assertSucceeds(
        setDoc(doc(userADb, 'users', 'userA_123', 'quizHistory', 'n4'), {
          uid: 'userA_123',
          datasetId: 'n4',
          sessions: [validQuizToken1],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await assertSucceeds(getDoc(doc(userADb, 'users', 'userA_123', 'quizHistory', 'n4')));
      await assertFails(getDoc(doc(userBDb, 'users', 'userA_123', 'quizHistory', 'n4')));
      await assertSucceeds(
        updateDoc(doc(userADb, 'users', 'userA_123', 'quizHistory', 'n4'), {
          sessions: [validQuizToken2, validQuizToken1],
          updatedAt: serverTimestamp(),
        })
      );
      await assertSucceeds(
        updateDoc(doc(userADb, 'users', 'userA_123', 'quizHistory', 'n4'), {
          sessions: [],
          updatedAt: serverTimestamp(),
        })
      );
      await assertSucceeds(deleteDoc(doc(userADb, 'users', 'userA_123', 'quizHistory', 'n4')));

      await assertFails(deleteDoc(doc(userBDb, 'users', 'userA_123')));

      // 8. 3-Tier RBAC, Bootstrap Superadmin protection, liveActivity, and immutable activityEvents
      const bootstrapDb = testEnv
        .authenticatedContext('boot_uid', {
          email_verified: true,
          email: 'jrenghaha2@gmail.com',
        })
        .firestore();
      const spoofedBootDb = testEnv
        .authenticatedContext('spoof_uid', {
          email_verified: false,
          email: 'jrenghaha2@gmail.com',
        })
        .firestore();
      const adminDb = testEnv
        .authenticatedContext('admin_uid', {
          email_verified: true,
          email: 'admin@example.com',
        })
        .firestore();
      const super2Db = testEnv
        .authenticatedContext('super2_uid', {
          email_verified: true,
          email: 'super2@example.com',
        })
        .firestore();

      // Unverified spoof with bootstrap email MUST fail
      await assertFails(getDocs(collection(spoofedBootDb, 'users')));

      // Bootstrap Superadmin creates own doc with role='superadmin'
      await assertSucceeds(
        setDoc(doc(bootstrapDb, 'users', 'boot_uid'), {
          uid: 'boot_uid',
          email: 'jrenghaha2@gmail.com',
          role: 'superadmin',
          mastered: [],
          hard: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      // Admin & Super2 create their base docs as regular users first
      await assertSucceeds(
        setDoc(doc(adminDb, 'users', 'admin_uid'), {
          uid: 'admin_uid',
          email: 'admin@example.com',
          role: 'user',
          mastered: [],
          hard: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await assertSucceeds(
        setDoc(doc(super2Db, 'users', 'super2_uid'), {
          uid: 'super2_uid',
          email: 'super2@example.com',
          role: 'user',
          mastered: [],
          hard: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      // Regular user cannot self-escalate
      await assertFails(
        updateDoc(doc(adminDb, 'users', 'admin_uid'), {
          role: 'admin',
          updatedAt: serverTimestamp(),
        })
      );

      // Bootstrap Superadmin promotes admin_uid -> admin and super2_uid -> superadmin
      await assertSucceeds(
        updateDoc(doc(bootstrapDb, 'users', 'admin_uid'), {
          role: 'admin',
          updatedAt: serverTimestamp(),
        })
      );
      await assertSucceeds(
        updateDoc(doc(bootstrapDb, 'users', 'super2_uid'), {
          role: 'superadmin',
          updatedAt: serverTimestamp(),
        })
      );

      // Admin has read-only access to users & subcollections, but CANNOT change any role
      await assertSucceeds(getDocs(collection(adminDb, 'users')));
      await assertSucceeds(getDoc(doc(adminDb, 'users', 'userA_123')));
      await assertFails(
        updateDoc(doc(adminDb, 'users', 'userA_123'), {
          role: 'admin',
          updatedAt: serverTimestamp(),
        })
      );

      // Secondary Superadmin CANNOT demote Bootstrap Superadmin or modify own role
      await assertFails(
        updateDoc(doc(super2Db, 'users', 'boot_uid'), {
          role: 'user',
          updatedAt: serverTimestamp(),
        })
      );
      await assertFails(
        updateDoc(doc(super2Db, 'users', 'super2_uid'), {
          role: 'user',
          updatedAt: serverTimestamp(),
        })
      );

      // liveActivity & append-only activityEvents
      const validLivePayload = {
        uid: 'userA_123',
        displayName: 'User A',
        email: '',
        avatarUrl: '',
        role: 'user',
        activityType: 'quiz_running',
        datasetMode: 'n4',
        datasetId: 'n4',
        moduleLabel: 'Kanji N4 · Kuis',
        scopeLabel: 'Semua',
        quizInProgress: true,
        quizCurrentQuestion: 2,
        quizTotalQuestions: 10,
        quizCorrectCount: 1,
        quizMode: 'k2r',
        totalMastered: 3,
        totalHard: 1,
        n4Mastered: 3,
        irodoriMastered: 0,
        totalQuizSessions: 1,
        lastQuizScore: 80,
        lastQuizTotal: 10,
        lastQuizDatasetId: 'n4',
        updatedAt: serverTimestamp(),
      };
      await assertSucceeds(setDoc(doc(userADb, 'liveActivity', 'userA_123'), validLivePayload));
      await assertFails(getDocs(collection(userADb, 'liveActivity')));
      await assertSucceeds(getDocs(collection(adminDb, 'liveActivity')));

      const validEventPayload = {
        uid: 'userA_123',
        displayName: 'User A',
        email: '',
        avatarUrl: '',
        eventType: 'quiz_completed',
        datasetId: 'n4',
        moduleLabel: 'Kanji N4 · Kuis',
        scopeLabel: 'Semua',
        quizMode: 'k2r',
        score: 90,
        correct: 9,
        total: 10,
        totalMastered: 3,
        summary: 'Menyelesaikan kuis Kanji N4 dengan skor 90%',
        createdAt: serverTimestamp(),
      };
      await assertSucceeds(setDoc(doc(userADb, 'activityEvents', 'ev_test_1'), validEventPayload));
      await assertFails(
        updateDoc(doc(userADb, 'activityEvents', 'ev_test_1'), { score: 100 })
      );
      await assertFails(deleteDoc(doc(userADb, 'activityEvents', 'ev_test_1')));
      await assertSucceeds(getDocs(collection(adminDb, 'activityEvents')));

      await assertSucceeds(deleteDoc(doc(userADb, 'users', 'userA_123')));
    } finally {
      await testEnv.cleanup();
    }
  }
);
