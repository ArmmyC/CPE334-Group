import type { RequestHandler } from 'express';
import type { CurrentUser, Role } from '@cpe334-group/shared';
import { SESSION_COOKIE, type SessionService } from '../auth/sessions.js';
import { forbidden, unauthenticated } from './errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: CurrentUser;
      sessionId?: number;
    }
  }
}

// Reads one cookie from the Cookie header. Express 5 has no built-in cookie parser.
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

// SR-01 step 1 (SDS 6.2): every route that is not public needs a valid session.
export function requireSession(sessions: SessionService): RequestHandler {
  return async (request, response, next) => {
    const session = await sessions.authenticate(readCookie(request.headers.cookie, SESSION_COOKIE));
    if (!session) {
      throw unauthenticated();
    }
    response.locals.user = session.user;
    response.locals.sessionId = session.sessionId;
    next();
  };
}

// SR-01 step 2 (SDS 6.2): a route for one role refuses the other with 403.
export function requireRole(role: Role): RequestHandler {
  return (_request, response, next) => {
    if (response.locals.user?.role !== role) {
      next(forbidden());
      return;
    }
    next();
  };
}
