# Security Specification — NIO | نيو

## 1. Data Invariants
1. **Exclusive Admin Authorization**: Only the verified Google account `mfb.15.f@gmail.com` (`request.auth.token.email_verified == true && request.auth.token.email == 'mfb.15.f@gmail.com'`) can create, edit, or delete events, create/list/delete invitations, create/list QR tickets, or manage shared reports.
2. **Independent Secret Tokens**:
   - Events are keyed by URL-safe `slug` and carry an unguessable 16+ char `shareToken` for host statistics.
   - Each guest invitation is keyed by an unguessable `inviteToken` (`/invite/:inviteToken`) and has an independent `qrToken` (`/qrTickets/{qrToken}`).
3. **Scoped Guest RSVP**: Opening `/invite/:inviteToken` allows `get` on that exact document (never `list`) and updating only `rsvpStatus`, `attendingCount`, `guestNote`, `rsvpAt`, and `updatedAt` while `checkedIn == false`, mirrored to `/sharedReports/{shareToken}/entries/{qrToken}` (`rsvpStatus`, `attendingCount`, `updatedAt`).
4. **Atomic Gate Check-In & Duplicate Tracking**: Gate scanning from `/` runs inside an atomic Firestore `runTransaction` updating both `/qrTickets/{qrToken}` and `/sharedReports/{shareToken}/entries/{qrToken}`:
   - First scan (`existing().checkedIn == false` -> `incoming().checkedIn == true` with `checkedInAt == request.time`): admitted once ("تم").
   - Subsequent scans (`existing().checkedIn == true` -> `duplicateAttempts == existing().duplicateAttempts + 1` with `lastDuplicateAt == request.time`): logs duplicate attempt ("محاولة استخدام الرمز مره اخرى").
5. **Read-Only Host Report**: `/sharedReports/{shareToken}` and `/sharedReports/{shareToken}/entries` require an unguessable `shareToken` (`>= 16` chars) and contain no private phone numbers or admin credentials.

## 2. Adversarial Vectors (Expected: PERMISSION_DENIED)
1. Non-admin user creates, updates, or deletes `/events/{eventSlug}`, `/invitations/{inviteToken}`, or `/sharedReports/{shareToken}`.
2. Non-admin calls `list` on `/events`, `/invitations`, or `/qrTickets`.
3. Public user tries to force `checkedIn: false` after admission or decrement `duplicateAttempts`.
4. Guest modifies `maxCompanions`, `qrToken`, `inviteToken`, or `shareToken` during RSVP.
5. Client injects extra shadow fields or forges `createdAt` / `checkedInAt` / `lastDuplicateAt` timestamps.
