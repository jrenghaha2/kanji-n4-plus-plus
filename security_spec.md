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

## 2. Adversarial Payloads & Access Attempts Tested (`firestore.rules.test.ts` & `firestore.emulator.test.ts`)
1. **Unauthenticated Read/Write**: `auth = null` attempting `get` or `set` on `/users/userA` or `/users/userA/irodoriProgress/pemula` -> `PERMISSION_DENIED`.
2. **Unverified Email Mutation**: `email_verified: false` attempting `create`/`update` -> `PERMISSION_DENIED`.
3. **Cross-User Read/Write/Delete**: `userB` attempting access to `userA` documents -> `PERMISSION_DENIED`.
4. **Collection Scraping (`list`)**: Listing `/users` or `/users/{userId}/irodoriProgress` -> `PERMISSION_DENIED`.
5. **Identity & Book Spoofing**: Mismatched `uid` or `bookId`, or invalid `bookId` (e.g. `dasar3`) -> `PERMISSION_DENIED`.
6. **Master Gate Bypass**: Creating/reading `/users/{uid}/irodoriProgress/{bookId}` before `/users/{uid}` exists -> `PERMISSION_DENIED`.
7. **Shadow / Ghost Field Injection**: Adding `isAdmin: true` or `role: 'admin'` -> `PERMISSION_DENIED`.
8. **Immortal Field Tampering & Forged Timestamps**: Mutating `uid`, `bookId`, `createdAt`, or supplying client timestamps -> `PERMISSION_DENIED`.
9. **Full-Array XSS & Separator Smuggling (Index > 0)**: Payloads such as `['n1', 'n2', '<script>alert(1)</script>']`, `['irp1', 'irp2,irp3']`, `['n1', 'n2|n3']`, or non-string elements -> `PERMISSION_DENIED`.
10. **Cross-Book Prefix Spoofing & Out-of-Range IDs**: Writing `ir1` inside `pemula`, `irp1137`, `ir1068`, `ir2_1289`, or `n501` -> `PERMISSION_DENIED`.
11. **Duplicates & Mastered/Hard Overlap**: Duplicate IDs or identical IDs in both `mastered` and `hard` -> `PERMISSION_DENIED`.
12. **Unsafe Profile Inputs**: `javascript:` or `data:image/svg+xml` in `avatarUrl`, or `displayName > 60` chars -> `PERMISSION_DENIED`.
