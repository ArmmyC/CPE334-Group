import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, User } from '../generated/prisma/client.js';
import type { CurrentUser } from '@cpe334-group/shared';
import type { Clock } from '../clock.js';
import { HttpError } from '../http/errors.js';
import { getDummyHash, verifyPassword } from './password.js';

// Session lifecycle from SDS 7.2 (NFR-04).
export const SESSION_COOKIE = 'sid';
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;

export type AuthenticatedSession = { sessionId: number; user: CurrentUser };

export type SessionService = ReturnType<typeof createSessionService>;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toCurrentUser({ id, name, email, role }: User): CurrentUser {
  return { id, name, email, role };
}

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

export function createSessionService({ prisma, clock }: { prisma: PrismaClient; clock: Clock }) {
  return {
    // Verifies the password and starts a session. A wrong email and a wrong password give
    // the same error, and an unknown email is still checked against a dummy hash (FR-01).
    // The session named by the request's own cookie, if any, ends too, so a shared PC does
    // not keep the previous user's session alive.
    async logIn(
      email: string,
      password: string,
      previousToken?: string,
    ): Promise<{ token: string; user: CurrentUser }> {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        await verifyPassword(password, await getDummyHash());
        throw invalidCredentials();
      }
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw invalidCredentials();
      }

      const now = clock.now();
      await prisma.session.deleteMany({
        where: {
          userId: user.id,
          OR: [
            { expiresAt: { lte: now } },
            { lastUsedAt: { lte: new Date(now.getTime() - SESSION_IDLE_MS) } },
          ],
        },
      });
      if (previousToken) {
        await prisma.session.deleteMany({ where: { tokenHash: hashToken(previousToken) } });
      }
      const token = randomBytes(32).toString('base64url');
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          createdAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
        },
      });
      return { token, user: toCurrentUser(user) };
    },

    // Finds the session for a cookie value. An expired session is deleted and treated as
    // missing. An accepted session moves last_used_at to now.
    async authenticate(token: string | undefined): Promise<AuthenticatedSession | null> {
      if (!token) {
        return null;
      }
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!session) {
        return null;
      }
      const now = clock.now();
      const idleUntil = session.lastUsedAt.getTime() + SESSION_IDLE_MS;
      if (now.getTime() >= session.expiresAt.getTime() || now.getTime() >= idleUntil) {
        await prisma.session.deleteMany({ where: { id: session.id } });
        return null;
      }
      // updateMany instead of update, so a session deleted by a logout in between gives 401.
      const touched = await prisma.session.updateMany({
        where: { id: session.id },
        data: { lastUsedAt: now },
      });
      if (touched.count === 0) {
        return null;
      }
      return { sessionId: session.id, user: toCurrentUser(session.user) };
    },

    async logOut(sessionId: number): Promise<void> {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },
  };
}
