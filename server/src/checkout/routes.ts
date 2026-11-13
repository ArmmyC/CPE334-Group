import type { RequestHandler } from 'express';
import { checkoutBodySchema } from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { validateBody } from '../http/validate.js';
import type { CheckoutService } from './service.js';

// A route id arrives as text. A value that is not a positive integer cannot be a request this
// custodian can see, so it gets the same 404 as a missing one (SDS 5.1).
function parseId(value: string): number {
  // Digits only: Number() would also accept 1e3, 0x10, " 12", and 1.0.
  if (!/^\d+$/.test(value)) {
    throw new HttpError(404, 'NOT_FOUND', 'This request could not be found.');
  }
  const id = Number(value);
  // 2147483647 is the largest PostgreSQL integer, so a larger id cannot exist.
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new HttpError(404, 'NOT_FOUND', 'This request could not be found.');
  }
  return id;
}

// Only `status=PENDING` is allowed in Sprint 1, and it is the default. Other filters are
// Sprint 3, and an unknown parameter is refused (SDS 5.1).
function checkListQuery(query: Record<string, unknown>) {
  const message = 'Check the highlighted fields.';
  const unknown = Object.keys(query).filter((key) => key !== 'status');
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      message,
      Object.fromEntries(unknown.map((name) => [name, 'Unknown parameter.'])),
    );
  }
  if (query.status !== undefined && query.status !== 'PENDING') {
    throw new HttpError(400, 'VALIDATION_ERROR', message, { status: 'Use status=PENDING.' });
  }
}

export function checkoutHandlers({ checkout }: { checkout: CheckoutService }) {
  const listPending: RequestHandler = async (request, response) => {
    checkListQuery(request.query);
    response.json({ items: await checkout.listPending(response.locals.user!.id) });
  };

  const listAvailableCopies: RequestHandler = async (request, response) => {
    const items = await checkout.listAvailableCopies(
      response.locals.user!.id,
      parseId(String(request.params.id)),
    );
    response.json({ items });
  };

  const checkoutRequest: RequestHandler = async (request, response) => {
    // The id is checked first, so a bad id is a 404 before the body is read.
    const requestId = parseId(String(request.params.id));
    const body = validateBody(checkoutBodySchema, request.body);
    const loan = await checkout.checkout(response.locals.user!.id, requestId, body.copyId);
    response.status(201).json(loan);
  };

  return { listPending, listAvailableCopies, checkout: checkoutRequest };
}
