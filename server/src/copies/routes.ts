import type { RequestHandler } from 'express';
import { updateCopyStatusRequestSchema } from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { validateBody } from '../http/validate.js';
import { notFoundCopy, type createCopyService } from './service.js';

type CopyService = ReturnType<typeof createCopyService>;

const MAX_ID = 2_147_483_647;

// HTTP handlers for F-06. They translate requests to copy service calls. The custodian comes
// from the session, never from the request (SDS 2.4).
export function copyHandlers({ copies }: { copies: CopyService }) {
  // SDS 5.1: unknown query parameters are refused with 400.
  const list: RequestHandler = async (request, response) => {
    const unknown = Object.keys(request.query);
    if (unknown.length > 0) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Check the highlighted fields.',
        Object.fromEntries(unknown.map((name) => [name, 'Unknown parameter.'])),
      );
    }
    response.json({ items: await copies.listForCustodian(response.locals.user!.id) });
  };

  const changeStatus: RequestHandler = async (request, response) => {
    // A non-integer id is a 404, the same as a missing copy (SDS 5.1).
    const rawId = String(request.params.id);
    const copyId = /^\d{1,10}$/.test(rawId) ? Number(rawId) : 0;
    if (copyId < 1 || copyId > MAX_ID) {
      throw notFoundCopy();
    }
    const { status } = validateBody(updateCopyStatusRequestSchema, request.body);
    response.json(await copies.changeStatus(response.locals.user!.id, copyId, status));
  };

  return { list, changeStatus };
}
