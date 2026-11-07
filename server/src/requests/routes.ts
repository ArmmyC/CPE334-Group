import type { RequestHandler } from 'express';
import { createRequestSchema } from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { validateBody } from '../http/validate.js';
import type { RequestService } from './service.js';

// A route id arrives as text. A value that is not a positive integer cannot be a request of
// this borrower, so it gets the same 404 as a missing one.
function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(404, 'NOT_FOUND', 'This request could not be found.');
  }
  return id;
}

export function requestHandlers({ requests }: { requests: RequestService }) {
  const create: RequestHandler = async (request, response) => {
    const body = validateBody(createRequestSchema, request.body);
    const created = await requests.submit(response.locals.user!.id, body);
    response.status(201).json(created);
  };

  const list: RequestHandler = async (_request, response) => {
    response.json(await requests.listOwn(response.locals.user!.id));
  };

  const cancel: RequestHandler = async (request, response) => {
    const cancelled = await requests.cancel(
      response.locals.user!.id,
      parseId(String(request.params.id)),
    );
    response.json(cancelled);
  };

  return { create, list, cancel };
}
