# Security Specification — N4 Kanji & Irodori 3-Tier RBAC + Real-Time Monitoring

## 1. Role Hierarchy & Authority Model
1. **Bootstrap Superadmin Utama**: `jrenghaha2@gmail.com` **strictly requires** `request.auth.token.email_verified == true` (spoofing email with `email_verified: false` is denied). Cannot be demoted or modified by any actor, including another Superadmin.
2. **Superadmin (`superadmin`)**:
   - Verified via `isBootstrapSuperAdmin()` OR `users/{request.auth.uid}.role == 'superadmin'` (always requires `email_verified == true`).
   - Read-only access to all `users`, `liveActivity`, `activityEvents`, and user progress/quizHistory subcollections.
   - May ONLY update `['role', 'updatedAt']` on another user's `/users/{targetUid}` (`targetUid != request.auth.uid`, `!isTargetBootstrapSuperAdmin(existing())`, `incoming().role in ['user', 'admin', 'superadmin']`).
   - Cannot modify own role (`targetUid == request.auth.uid` is denied for role mutation) and cannot modify learning progress/profile of other users.
3. **Admin (`admin`)**:
   - Verified via `users/{request.auth.uid}.role == 'admin'` (with `email_verified == true`).
   - Strictly **read-only** access to monitoring collections (`users`, `liveActivity`, `activityEvents`) and user subcollections (`irodoriProgress`, `quizHistory`).
   - Blocked from modifying any other user's document or `role`.
4. **Pembelajar / Regular User (`user`)**:
   - Strictly isolated to own `/users/{uid}`, own subcollections, own `/liveActivity/{uid}`, and append-only create/own-get on `/activityEvents/{eventId}`.
   - Forbidden from listing `users`, `liveActivity`, or `activityEvents`.
   - Forbidden from self-assigning `admin` or `superadmin` on create or update (except Bootstrap Superadmin ensuring own `role == 'superadmin'`).

## 2. Collection Data Invariants
### A. `/users/{userId}` (`UserProgress`)
- Required keys: `uid`, `mastered`, `hard`, `createdAt`, `updatedAt`. Optional: `displayName`, `email`, `avatarUrl`, `role`.
- `mastered` & `hard`: unique, mutually exclusive lists `<= 500` N4 kanji IDs validated via dual-separator join (`','` and `'|'`).
- Immutable fields: `uid`, `createdAt`. Server timestamp enforced via `request.time`.
- Action-based updates partitioned into Owner actions (progress, profile, combined, safe legacy metadata auto-heal without role escalation) and Superadmin role-assignment action (`['role', 'updatedAt']` only).

### B. `/users/{userId}/irodoriProgress/{bookId}` & `/users/{userId}/quizHistory/{datasetId}`
- Master Gate: Parent `/users/{userId}` must exist.
- Read (`get` / `list` for Admin/Superadmin; `get` for owner). Mutations (`create`, `update`, `delete`) strictly owner-only with `email_verified == true` and full-array validation.

### C. `/liveActivity/{userId}` (`LiveActivity`)
- Master Gate: Create requires parent `/users/{userId}` to exist.
- `get`: owner or `isAdminOrAbove()`. `list`: strictly `isAdminOrAbove()`.
- `create` / `update` / `delete`: strictly verified owner, closed schema, bounded string sizes and integer ranges, server timestamp `updatedAt == request.time`.

### D. `/activityEvents/{eventId}` (`ActivityEvent`)
- Master Gate: Create requires parent `/users/{request.auth.uid}` to exist.
- `get`: `isAdminOrAbove()` or owner (`existing().uid == request.auth.uid`). `list`: strictly `isAdminOrAbove()`.
- `create`: verified user with `incoming().uid == request.auth.uid`, valid enum/bounds, `createdAt == request.time`.
- `update` / `delete`: permanently denied (`if false;`) — immutable append-only event log.

## 3. Adversarial Payloads & Red Team Matrix (`firestore.rules.test.ts` & `firestore.emulator.test.ts`)
1. **Unauthenticated Access**: `auth = null` on any collection -> `PERMISSION_DENIED`.
2. **Email Spoofing Attack**: `email: 'jrenghaha2@gmail.com'` with `email_verified: false` attempting admin list or role update -> `PERMISSION_DENIED`.
3. **Self-Role Escalation on Create**: Regular verified user creating `/users/{uid}` with `role: 'admin'` or `role: 'superadmin'` -> `PERMISSION_DENIED`.
4. **Self-Role Escalation on Update**: Regular user or Admin attempting to update own `role` to `'admin'` or `'superadmin'` -> `PERMISSION_DENIED`.
5. **Admin Write Escalation**: Admin attempting to change another user's `role` -> `PERMISSION_DENIED`.
6. **Bootstrap Superadmin Tampering**: Another Superadmin attempting to demote or change `role` of `jrenghaha2@gmail.com` -> `PERMISSION_DENIED`.
7. **Superadmin Self-Demotion**: Superadmin attempting to change own `role` via Superadmin action -> `PERMISSION_DENIED`.
8. **Superadmin Scope Creep**: Superadmin attempting to mutate `mastered`, `displayName`, or inject shadow fields on another user while updating `role` -> `PERMISSION_DENIED`.
9. **Unauthorized Collection Scraping**: Regular user attempting `list` on `/users`, `/liveActivity`, or `/activityEvents` -> `PERMISSION_DENIED`.
10. **Cross-User LiveActivity / Event Forgery**: User A writing `/liveActivity/userB` or creating `/activityEvents/{id}` with `uid: 'userB'` -> `PERMISSION_DENIED`.
11. **Immutable Event Log Tampering**: Any user or Superadmin attempting `update` or `delete` on `/activityEvents/{eventId}` -> `PERMISSION_DENIED`.
12. **Full-Array XSS, Separator Smuggling & Value Poisoning**: Invalid Kanji/Irodori/Quiz tokens at index > 0, oversized strings, invalid enums, or forged timestamps -> `PERMISSION_DENIED`.
