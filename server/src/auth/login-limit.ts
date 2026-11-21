import type { PrismaClient } from '@prisma/client';

// F-15 (NFR-06, SDS 7.3): after MAX_FAILURES failed logins for one email inside WINDOW_MS, every
// login for that email is refused until the count falls below the limit again.
export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

// Returns how many seconds the email stays locked, or null when it is not locked. Only failures
// after the last success count, so a success resets the count. The window slides: the lock ends
// when the oldest failure that keeps the count at the limit is 15 minutes old.
export async function loginLockSeconds(
  prisma: PrismaClient,
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

// Records one attempt that reached the password check. Refused attempts are never recorded, so
// they do not extend the window.
export async function recordLoginAttempt(
  prisma: PrismaClient,
  email: string,
  succeeded: boolean,
  now: Date,
): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, attemptedAt: now, succeeded } });
}
