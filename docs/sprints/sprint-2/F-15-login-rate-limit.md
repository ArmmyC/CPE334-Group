# F-15 Login Rate Limit

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @Bank848 (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: NFR-06
Depends on: F-01 sign-in (merged)
Sources: [SRS](../../srs.md) NFR-06; [System-Level SDS](../../system-sds.md) sections 3.2, 7.2, 7.3

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Not yet reviewed by the teammate. |

## 1. Feature-Level SDS

### 1.1 Purpose

After 10 failed logins for one email within 15 minutes, every login for that email is refused with HTTP 429 until the window ends, including a login with the correct password. A successful login before the limit resets the count.

### 1.2 Components

| Component | File | Responsibility |
| --- | --- | --- |
| Rate limit | `server/src/auth/login-limit.ts` (new) | `checkLoginLimit(prisma, email, now)`: counts failed attempts and returns the seconds until the lock ends, or null. `recordLoginAttempt(prisma, email, succeeded, now)`. |
| Session service | `server/src/auth/sessions.ts` | `logIn` checks the limit first, records each attempt that reaches the password check, and never records a refused attempt. |
| Error | `server/src/http/errors.ts` | The 429 response uses the shared error shape with code `TOO_MANY_ATTEMPTS` and a `Retry-After` header in seconds. |
| Migration | `server/prisma/migrations/<new>` | Adds table `login_attempt` (`id`, `email`, `attempted_at`, `succeeded`) and an index on (`email`, `attempted_at`) (SDS 3.2). |

### 1.3 Rules

- The email is lower-cased before it is counted, so `A@x` and `a@x` share one count.
- A failed attempt is a login that reached the password check and failed: a wrong password, or an unknown email. An unknown email is counted too, so the 429 does not reveal whether an account exists.
- Locked means: at least 10 failed attempts for the email with `attempted_at` after `now - 15 minutes` and after the last successful attempt for that email. The window slides: the lock ends when the count falls below 10, that is 15 minutes after the oldest of the counted failures that keep it at 10.
- A locked login returns 429 before the password is checked and before anything is recorded, so refused attempts do not extend the window.
- A successful login records `succeeded = true`. Failures before it no longer count.
- The time comes from the injected clock (SDS 8).
- Known limit: attempts that arrive in parallel can pass the check together, so a few more than 10 can reach the password check. The lock holds from the next attempt. This is accepted for this size and is not tested.

### 1.4 Data

`login_attempt` has no foreign key, because attempts for unknown emails are recorded. Rows are not deleted in Sprint 2 (kept for the Sprint 3 audit view if one is added).

## 2. API specification

| Method and path | Access | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | Public | `{ email, password }` | 200 user, unchanged | 400, 401 `INVALID_CREDENTIALS` unchanged, 429 `TOO_MANY_ATTEMPTS` with `Retry-After` (seconds, at least 1) |

## 3. UI specification

The login form already shows the API message for a failed login. For 429 it shows "Too many failed attempts. Try again in a few minutes." and keeps the form usable.

## 4. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-F15-01 | NFR-06 | After 10 failed attempts for one email, the 11th attempt, even with the correct password, returns 429 and creates no session. |
| AC-F15-02 | NFR-06 | After 9 failed attempts, a correct login succeeds. A successful login resets the count. |
| AC-F15-03 | NFR-06 | After the window passes (15 minutes after the failures), a correct login succeeds again. |
| AC-F15-04 | NFR-06 | Refused attempts are not recorded and do not extend the window. |
| AC-F15-05 | NFR-06 | The count is per email (case-insensitive). Another email is not affected. Unknown emails are counted. |
| AC-F15-06 | NFR-06 | The 429 body uses the shared error shape and the response has a `Retry-After` header. |
| AC-F15-07 | NFR-06 | The login page shows the 429 message. |

## 5. Test specifications

| Test | AC | Level | Precondition or input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-F15-01 | AC-F15-01 | API, DB | A borrower, controllable clock | 10 wrong passwords, then the correct one | 401 ten times, then 429 `TOO_MANY_ATTEMPTS`. No session row. |
| TEST-F15-02 | AC-F15-02 | API | Same | 9 wrong, 1 correct, then 9 wrong, then correct | 200 both times. The count restarts after the success. |
| TEST-F15-03 | AC-F15-03 | API | Locked email | Advance the clock 15 minutes after the first counted failure, then log in | 200 |
| TEST-F15-04 | AC-F15-04 | API, DB | Locked email | 3 more attempts at later times inside the window | 429 each. `login_attempt` row count is unchanged. The lock still ends 15 minutes after the original failures. |
| TEST-F15-05 | AC-F15-05 | API | Two borrowers | Lock one (mixed-case email in some attempts). An unknown email fails 10 times. | The other borrower logs in. The unknown email gets 429 on the 11th. |
| TEST-F15-06 | AC-F15-06 | API | Locked email | Log in | Body parses with the shared error schema, code `TOO_MANY_ATTEMPTS`. `Retry-After` is a positive integer not above 900. |
| TEST-F15-07 | AC-F15-07 | UI | Login page with a stubbed 429 | Submit the form | The message is shown and the form stays enabled. |

## 6. SR rules

SR-02 (error shape). SR-04 does not add anything: the table is created by the migration.

## 7. Definition of Done

- Contract committed before tests, tests failing before implementation.
- TEST-F15-01 to TEST-F15-07 executed and passing. Lint, format, build, existing tests pass. The migration applies.
- The seeded smoke and E2E logins still pass. Each adds one `login_attempt` row, which is expected (SDS, smoke test row).
- Teammate review and merge into `sprint-2` (pending).
