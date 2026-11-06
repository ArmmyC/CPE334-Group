import type { CookieOptions, RequestHandler } from 'express';
import { loginRequestSchema } from '@cpe334-group/shared';
import { validateBody } from '../http/validate.js';
import { SESSION_ABSOLUTE_MS, SESSION_COOKIE, type SessionService } from './sessions.js';

// HTTP handlers for F-01. They translate requests to session service calls and own the cookie.
export function authHandlers({
  sessions,
  secureCookies,
}: {
  sessions: SessionService;
  secureCookies: boolean;
}) {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: secureCookies,
  };

  const login: RequestHandler = async (request, response) => {
    const { email, password } = validateBody(loginRequestSchema, request.body);
    const { token, user } = await sessions.logIn(email, password);
    response.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_ABSOLUTE_MS });
    response.json(user);
  };

  const logout: RequestHandler = async (_request, response) => {
    await sessions.logOut(response.locals.sessionId!);
    response.clearCookie(SESSION_COOKIE, cookieOptions);
    response.status(204).end();
  };

  const me: RequestHandler = (_request, response) => {
    response.json(response.locals.user);
  };

  return { login, logout, me };
}
