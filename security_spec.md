# Security Specification — N4 Kanji & Irodori Cloud Sync

## 1. Data Invariants

### A. `/users/{userId}` (`UserProgress`)
1. **Strict Ownership**: Every document in `/users/{userId}` belongs strictly to the authenticated user where `request.auth.uid == userId` and `data.uid == request.auth.uid`. Cross-user reads (`get`), queries (`list`), writes (`create`, `update`), and deletions (`delete`) are forbidden.
2. **Verified Identity**: All mutations (`create`, `update`, `delete`) require an authenticated account with `request.auth.token.email_verified == true`.
3. **Closed Schema & Action-Based Updates**: Only `uid`, `mastered`, `hard`, `createdAt`, `updatedAt`, and optional `displayName` (`<= 60` chars) / `avatarUrl` (`<= 20,000` chars, strictly `""`, `https://...`, or compressed `data:image/(jpeg|png|webp);base64,...`) may exist. Unknown/shadow fields (`role`, `isAdmin`, `email`, etc.) are rejected.
4. **Immutable Identity & Server Timestamps**: `uid` and `createdAt` can never change after creation; `createdAt` (on create) and `updatedAt` (on create/update) must always equal `request.time`.
5. **Full-Array Bounded & Disjoint Lists**: `mastered` and `hard` must be unique lists of `<= 500` items, mutually exclusive (`toSet().intersection(...).size() == 0`), where **every element** is validated via dual-separator join (`','` and `'|'`) against `^n([1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$`.
6. **Zero Listing**: `allow list: if false;` prevents collection enumeration.

### B. `/users/{userId}/irodoriProgress/{bookId}` (`IrodoriBookProgress`)
1. **Master Gate**: All operations (`get`, `create`, `update`, `delete`) require the parent `/users/{userId}` document to exist (`exists(/databases/$(database)/documents/users/$(userId))`), evaluated after all cheap static checks.
2. **Strict Book Allowlist**: `bookId` path variable and `data.bookId` field must match and be strictly in `['pemula', 'dasar1', 'dasar2']`.
3. **Closed Schema & Immutability**: Only `uid`, `bookId`, `mastered`, `hard`, `createdAt`, and `updatedAt` are permitted. Updates may only mutate `['mastered', 'hard', 'updatedAt']`; `uid`, `bookId`, and `createdAt` are immutable.
4. **Per-Book Full-Array Validation**: Every element of `mastered` and `hard` is validated via uniqueness (`toSet()`), mutual exclusivity (`intersection().size() == 0`), and dual-separator join (`','` and `'|'`) against exact per-book patterns and bounds:
   - `pemula`: `<= 1,136` items (`^irp([1-9]|...|113[0-6])$`, `join(',').size() <= 9500`)
   - `dasar1`: `<= 1,067` items (`^ir([1-9]|...|106[0-7])$`, `join(',').size() <= 8000`)
   - `dasar2`: `<= 1,288` items (`^ir2_([1-9]|...|128[0-8])$`, `join(',').size() <= 12000`)
5. **Zero Listing**: `allow list: if false;` — the client reads and subscribes directly to the 3 known book IDs.

### C. `/users/{userId}/quizHistory/{datasetId}` (`QuizHistoryBucket`)
1. **Master Gate**: All operations (`get`, `create`, `update`, `delete`) require the parent `/users/{userId}` document to exist (`exists(/databases/$(database)/documents/users/$(userId))`), evaluated after all cheap static checks.
2. **Strict Dataset Allowlist**: `datasetId` path variable and `data.datasetId` field must match and be strictly in `['n4', 'pemula', 'dasar1', 'dasar2']`.
3. **Closed Schema & Immutability**: Only `uid`, `datasetId`, `sessions`, `createdAt`, and `updatedAt` are permitted. Updates may only mutate `['sessions', 'updatedAt']`; `uid`, `datasetId`, and `createdAt` are immutable.
4. **Compact ID-Reference Full-Array Validation**: `sessions` must be a unique list of `<= 15` compact ASCII session tokens (`join(',').size() <= 160000`), where **every element** (indices `0..14`) is validated via dual-separator join (`','` and `'~'`) against the strict token grammar (`id|completedAt|level|mode|correct|total|score|scopeCode|answersPacked`). Zero free-form text, HTML, or JSON strings are stored; full Kanji/Irodori labels and conjugated sentence forms are hydrated client-side from static bundled dictionaries.
5. **Zero Listing**: `allow list: if false;` — the client lazy-reads only the specific active dataset document on demand (`1 getDoc` cached per session).

## 2. Adversarial Payloads & Access Attempts Tested (`firestore.rules.test.ts` & `firestore.emulator.test.ts`)
1. **Unauthenticated Read/Write**: `auth = null` attempting `get` or `set` on `/users/userA`, `/users/userA/irodoriProgress/pemula`, or `/users/userA/quizHistory/n4` -> `PERMISSION_DENIED`.
2. **Unverified Email Mutation**: `email_verified: false` attempting `create`/`update` -> `PERMISSION_DENIED`.
3. **Cross-User Read/Write/Delete**: `userB` attempting access to `userA` documents -> `PERMISSION_DENIED`.
4. **Collection Scraping (`list`)**: Listing `/users`, `/users/{userId}/irodoriProgress`, or `/users/{userId}/quizHistory` -> `PERMISSION_DENIED`.
5. **Identity & Dataset Spoofing**: Mismatched `uid`, `bookId`, or `datasetId`, or invalid `datasetId` (e.g. `dasar3`) -> `PERMISSION_DENIED`.
6. **Master Gate Bypass**: Creating/reading `/users/{uid}/irodoriProgress/{bookId}` or `/users/{uid}/quizHistory/{datasetId}` before `/users/{uid}` exists -> `PERMISSION_DENIED`.
7. **Shadow / Ghost Field Injection**: Adding `isAdmin: true` or `role: 'admin'` -> `PERMISSION_DENIED`.
8. **Immortal Field Tampering & Forged Timestamps**: Mutating `uid`, `bookId`, `datasetId`, `createdAt`, or supplying client timestamps -> `PERMISSION_DENIED`.
9. **Full-Array XSS & Separator Smuggling (Index > 0)**: Payloads such as `['n1', 'n2', '<script>alert(1)</script>']`, `['irp1', 'irp2,irp3']`, `['n1', 'n2|n3']`, comma/tilde smuggling inside `sessions` at index > 0, or non-string elements -> `PERMISSION_DENIED`.
10. **Cross-Book Prefix Spoofing & Out-of-Range IDs / Scores**: Writing `ir1` inside `pemula`, `irp1137`, `ir1068`, `ir2_1289`, `n501`, `score > 100`, or `> 15` quiz sessions -> `PERMISSION_DENIED`.
11. **Duplicates & Mastered/Hard Overlap**: Duplicate IDs/sessions or identical IDs in both `mastered` and `hard` -> `PERMISSION_DENIED`.
12. **Unsafe Profile Inputs**: `javascript:` or `data:image/svg+xml` in `avatarUrl`, or `displayName > 60` chars -> `PERMISSION_DENIED`.
