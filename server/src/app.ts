import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { apiError, type HealthResponse } from '@cpe334-group/shared';

export type AppDependencies = {
  checkDatabase: () => Promise<void>;
  healthTimeoutMs?: number;
};

// Rejects when the promise has not settled in time, so a stalled database
// gives a quick 503 instead of a hanging health check.
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createApp({ checkDatabase, healthTimeoutMs = 2000 }: AppDependencies) {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_request, response) => {
    try {
      await withTimeout(checkDatabase(), healthTimeoutMs);
      response.json({ status: 'ok', database: 'ok' } satisfies HealthResponse);
    } catch {
      response
        .status(503)
        .json({ status: 'error', database: 'unreachable' } satisfies HealthResponse);
    }
  });

  app.use('/api', (_request, response) => {
    response.status(404).json(apiError('NOT_FOUND', 'Route not found.'));
  });

  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json(apiError('INVALID_JSON', 'The request body is not valid JSON.'));
      return;
    }
    console.error(error);
    response.status(500).json(apiError('INTERNAL_ERROR', 'Something went wrong.'));
  };
  app.use(handleError);

  return app;
}
