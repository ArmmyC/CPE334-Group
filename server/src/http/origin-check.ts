import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Second CSRF layer after SameSite=Lax (SDS 7.4). A state-changing request with an Origin
// header that is not in the allow list is refused. A request with no Origin header, such as
// the deploy smoke test or an API test, is not refused by this check.
export function originCheck(allowedOrigins: readonly string[]): RequestHandler {
  return (request, _response, next) => {
    const origin = request.get('origin');
    if (
      STATE_CHANGING.has(request.method) &&
      origin !== undefined &&
      !allowedOrigins.includes(origin)
    ) {
      next(
        new HttpError(
          403,
          'INVALID_ORIGIN',
          'This request came from an origin that is not allowed.',
        ),
      );
      return;
    }
    next();
  };
}
