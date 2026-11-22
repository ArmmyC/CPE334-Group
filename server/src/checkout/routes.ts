import type { RequestHandler } from 'express';
import {
  checkoutBodySchema,
  custodianRequestsQuerySchema,
  rejectRequestBodySchema,
} from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { checkQuery } from '../http/query.js';
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

export function checkoutHandlers({ checkout }: { checkout: CheckoutService }) {
  const listPending: RequestHandler = async (request, response) => {
    const filters = checkQuery(
      custodianRequestsQuerySchema,
      ['status', 'labId', 'borrowerId'],
      request.query,
    );
    response.json({ items: await checkout.listPending(response.locals.user!.id, filters) });
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

  // F-08. The id is checked first, so a bad id is a 404 before the body is read.
  const rejectRequest: RequestHandler = async (request, response) => {
    const requestId = parseId(String(request.params.id));
    const body = validateBody(rejectRequestBodySchema, request.body);
    response.json(await checkout.reject(response.locals.user!.id, requestId, body));
  };

  return { listPending, listAvailableCopies, checkout: checkoutRequest, reject: rejectRequest };
}
