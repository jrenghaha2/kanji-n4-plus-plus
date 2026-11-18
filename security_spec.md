# Security Specification — N4 Kanji Progress Sync

## 1. Data Invariants
1. **Strict Ownership**: Every document in `/users/{userId}` belongs strictly to the authenticated user whose `request.auth.uid == userId` and `uid == request.auth.uid`. Cross-user reads (`get`), queries (`list`), writes (`create`, `update`), and deletions (`delete`) are forbidden.
2. **Verified Identity**: All mutations (`create`, `update`, `delete`) require an authenticated Google account with `request.auth.token.email_verified == true`.
3. **Closed Schema & Anti-Update-Gap**: Only `uid`, `mastered`, `hard`, `createdAt`, and `updatedAt` may exist on `/users/{userId}`. Unknown/ghost fields (`role`, `isAdmin`, `email`, etc.) are rejected.
4. **Immutable Identity & Creation Timestamp**: `uid` and `createdAt` can never change after creation; `updatedAt` must always equal `request.time`.
5. **Bounded & Typed Lists**: `mastered` and `hard` must be lists of `<= 500` items; when non-empty, element checks and client sanitization enforce valid Kanji IDs (`^n[0-9]{1,3}$`).
6. **Zero Listing & Zero PII Storage**: `allow list: if false;` prevents collection enumeration, and no PII (`email`, `displayName`, `photoURL`) is persisted to Firestore.

## 2. The "Dirty Dozen" Adversarial Payloads & Access Attempts
1. **Unauthenticated Read/Write**: `auth = null` attempting `get` or `set` on `/users/userA` -> `PERMISSION_DENIED`.
2. **Unverified Email Mutation**: `auth = { uid: 'userA', token: { email_verified: false } }` attempting `create`/`update` on `/users/userA` -> `PERMISSION_DENIED`.
3. **Cross-User Read (`get`)**: `auth = userB` attempting `get` on `/users/userA` -> `PERMISSION_DENIED`.
4. **Collection Scraping (`list`)**: `auth = userA` attempting `list` on `/users` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: `auth = userA` writing `/users/userA` with `{ uid: 'userB', ... }` -> `PERMISSION_DENIED`.
6. **Path-ID Poisoning**: Path `/users/..invalid..id..` or 1.5KB string exceeding 128 chars -> `PERMISSION_DENIED`.
7. **Shadow / Ghost Field Injection**: Adding `{ isAdmin: true }` or `{ role: 'admin' }` on create or update -> `PERMISSION_DENIED`.
8. **Missing Required Fields**: Creating `/users/userA` omitting `hard` or `createdAt` -> `PERMISSION_DENIED`.
9. **Immortal Field Tampering**: Updating `/users/userA` trying to alter `uid` or `createdAt` -> `PERMISSION_DENIED`.
10. **Client-Forged Timestamp**: Setting `createdAt` or `updatedAt` to a past/future client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
11. **Denial-of-Wallet Array Overflow**: Writing `mastered` with 501+ elements -> `PERMISSION_DENIED`.
12. **Value Type / Pattern Poisoning**: Writing `mastered: [12345]` or `mastered: ['<script>alert(1)</script>']` -> `PERMISSION_DENIED`.
