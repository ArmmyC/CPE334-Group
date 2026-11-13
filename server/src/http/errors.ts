import type { ErrorRequestHandler, RequestHandler } from 'express';
import { apiError } from '@cpe334-group/shared';

// An error the API reports to the client as-is, in the shared error shape (SDS 5.3).
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

export const forbidden = () =>
  new HttpError(403, 'FORBIDDEN', 'You do not have access to this action.');

export const notFound: RequestHandler = () => {
  throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
};

// The one place that turns an error into a response. Unknown errors are logged on the
// server and reach the client only as INTERNAL_ERROR, with no stack trace or SQL.
export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json(apiError(error.code, error.message, error.fields));
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    response.status(400).json(apiError('INVALID_JSON', 'The request body is not valid JSON.'));
    return;
  }
  if (error?.type === 'entity.too.large') {
    response.status(413).json(apiError('PAYLOAD_TOO_LARGE', 'The request body is too large.'));
    return;
  }
  // A transaction that waited past maxWait or timeout (SDS 2.5). Nothing was changed.
  if (error?.code === 'P2028') {
    response.status(503).json(apiError('SERVICE_BUSY', 'The service is busy. Try again.'));
    return;
  }
  console.error(error);
  response.status(500).json(apiError('INTERNAL_ERROR', 'Something went wrong.'));
};
