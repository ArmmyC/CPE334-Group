import { join } from 'node:path';
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

  if (deps.clientDir) {
    const clientDir = deps.clientDir;
    app.use(express.static(clientDir));
    // A client-side route such as /catalog/4 gets the SPA page. A path with a file extension
    // that is not on disk stays a 404, so a missing asset is not answered with HTML.
    app.get(/^\/(?!api(\/|$))[^.]*$/, (_request, response) => {
      response.sendFile(join(clientDir, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
