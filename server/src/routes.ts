import type { RequestHandler } from 'express';
import type { Role } from '@cpe334-group/shared';
import { authHandlers } from './auth/routes.js';
import { createSessionService } from './auth/sessions.js';
import type { AppDependencies } from './dependencies.js';
import { healthHandler } from './health.js';

// `public` needs nothing, `signed-in` needs a session, and a role needs a session with that role.
export type Access = 'public' | 'signed-in' | Role;

export type RouteDefinition = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  access: Access;
  handler: RequestHandler;
};

// The one route table (SDS 6.2). The app registers API routes only from here, and the
// AC-SR01-01 test calls every entry that is not public without a session, so a new
// endpoint is checked as soon as it is added.
export function buildRoutes(deps: AppDependencies): RouteDefinition[] {
  const auth = authHandlers({
    sessions: createSessionService(deps),
    secureCookies: deps.secureCookies ?? false,
  });

  return [
    {
      method: 'get',
      path: '/api/health',
      access: 'public',
      handler: healthHandler(deps.checkDatabase, deps.healthTimeoutMs ?? 2000),
    },
    { method: 'post', path: '/api/auth/login', access: 'public', handler: auth.login },
    { method: 'post', path: '/api/auth/logout', access: 'signed-in', handler: auth.logout },
    { method: 'get', path: '/api/auth/me', access: 'signed-in', handler: auth.me },
  ];
}
