import type { RequestHandler } from 'express';
import type { HealthResponse, ReadyResponse } from '@cpe334-group/shared';

// Rejects when the promise has not settled in time, so a stalled database
// gives a quick 503 instead of a hanging health check.
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function healthHandler(
  checkDatabase: () => Promise<void>,
  timeoutMs: number,
): RequestHandler {
  return async (_request, response) => {
    try {
      await withTimeout(checkDatabase(), timeoutMs);
      response.json({ status: 'ok', database: 'ok' } satisfies HealthResponse);
    } catch {
      response
        .status(503)
        .json({ status: 'error', database: 'unreachable' } satisfies HealthResponse);
    }
  };
}

// Same shape as the health check, but it also needs the migrations. The reason is never
// sent, because it can name the database or a user.
export function readyHandler(checkReady: () => Promise<void>, timeoutMs: number): RequestHandler {
  return async (_request, response) => {
    try {
      await withTimeout(checkReady(), timeoutMs);
      response.json({ status: 'ready' } satisfies ReadyResponse);
    } catch {
      response.status(503).json({ status: 'not-ready' } satisfies ReadyResponse);
    }
  };
}
