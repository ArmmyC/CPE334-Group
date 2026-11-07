import express from 'express';
import helmet from 'helmet';
import { createSessionService } from './auth/sessions.js';
import type { AppDependencies } from './dependencies.js';
import { requireRole, requireSession } from './http/access.js';
import { errorHandler, notFound } from './http/errors.js';
import { originCheck } from './http/origin-check.js';
import { buildRoutes } from './routes.js';

export type { AppDependencies } from './dependencies.js';

// Request flow from SDS 2.3: helmet and the JSON limit, the Origin check, the route's
// session and role checks, then the handler. Every error goes through one error mapper.
export function createApp(deps: AppDependencies) {
  const app = express();
  const sessions = createSessionService(deps);

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', originCheck(deps.allowedOrigins));

  for (const route of buildRoutes(deps)) {
    const guards =
      route.access === 'public'
        ? []
        : route.access === 'signed-in'
          ? [requireSession(sessions)]
          : [requireSession(sessions), requireRole(route.access)];
    app[route.method](route.path, ...guards, route.handler);
  }

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
