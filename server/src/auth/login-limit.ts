import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../http/errors.js';

// F-15 (NFR-06, SDS 7.3): after MAX_FAILURES failed logins for one email inside WINDOW_MS, every
// login for that email is refused until the count falls below the limit again.
export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

// An attempt older than the window never changes a lock, a success included, so it is dead data.
// Each login deletes up to PRUNE_BATCH of them for any email, which keeps the table at about the
// size of the last 15 minutes of traffic with a bounded cost per login.
const PRUNE_BATCH = 100;

async function pruneOldAttempts(prisma: Prisma.TransactionClient, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  await prisma.$executeRaw`
    DELETE FROM login_attempt
    WHERE id IN (
      SELECT id FROM login_attempt WHERE attempted_at < ${cutoff} ORDER BY attempted_at LIMIT ${PRUNE_BATCH}
    )`;
}

// Returns how many seconds the email stays locked, or null when it is not locked. Only failures
// after the last success count, so a success resets the count. The window slides: the lock ends
// when the oldest failure that keeps the count at the limit is 15 minutes old.
export async function loginLockSeconds(
  prisma: Prisma.TransactionClient,
  email: string,
  now: Date,
): Promise<number | null> {
  const lastSuccess = await prisma.loginAttempt.findFirst({
    where: { email, succeeded: true },
    orderBy: { attemptedAt: 'desc' },
    select: { attemptedAt: true },
  });
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const since =
    lastSuccess && lastSuccess.attemptedAt > windowStart ? lastSuccess.attemptedAt : windowStart;
  const failures = await prisma.loginAttempt.findMany({
    where: { email, succeeded: false, attemptedAt: { gt: since } },
    orderBy: { attemptedAt: 'desc' },
    take: MAX_FAILURES,
    select: { attemptedAt: true },
  });
  if (failures.length < MAX_FAILURES) {
    return null;
  }
  const unlocksAt = failures[MAX_FAILURES - 1].attemptedAt.getTime() + WINDOW_MS;
  return Math.max(1, Math.ceil((unlocksAt - now.getTime()) / 1000));
}

// Checks the lock and records the attempt as a failure in one short transaction, under an advisory
// lock for the email. Parallel attempts for one email therefore see each other's rows, so a burst
// cannot get past the limit together. The password is checked after this returns, outside the
// transaction, so no connection is held during hashing. A locked attempt throws 429 and records
// nothing, so refused attempts do not extend the window.
export async function beginLoginAttempt(
  prisma: PrismaClient,
  email: string,
  now: Date,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
    await pruneOldAttempts(tx, now);
    const lockSeconds = await loginLockSeconds(tx, email, now);
    if (lockSeconds !== null) {
      throw new HttpError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Too many failed attempts. Try again in a few minutes.',
        undefined,
        { 'Retry-After': String(lockSeconds) },
      );
    }
    const attempt = await tx.loginAttempt.create({
      data: { email, attemptedAt: now, succeeded: false },
      select: { id: true },
    });
    return attempt.id;
  });
}

// The password matched: the attempt recorded by beginLoginAttempt becomes a success, which resets
// the count (NFR-06).
export async function markLoginSucceeded(
  prisma: PrismaClient,
  attemptId: number,
  now: Date,
): Promise<void> {
  await prisma.loginAttempt.update({
    where: { id: attemptId },
    data: { succeeded: true, attemptedAt: now },
  });
}
