import type { RequestHandler } from 'express';
import { equipmentTypeCreateBodySchema, equipmentTypeEditBodySchema } from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { validateBody } from '../http/validate.js';
import type { EquipmentTypeService } from './service.js';

const MAX_ID = 2_147_483_647;

// HTTP handlers for F-12. The custodian comes from the session, never from the request (SDS 2.4).
export function equipmentTypeHandlers({ types }: { types: EquipmentTypeService }) {
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
    response.json(await types.list(response.locals.user!.id));
  };

  const create: RequestHandler = async (request, response) => {
    const body = validateBody(equipmentTypeCreateBodySchema, request.body);
    response.status(201).json(await types.create(response.locals.user!.id, body));
  };

  const update: RequestHandler = async (request, response) => {
    // A non-integer id is a 404, the same as a missing type (SDS 5.1).
    const rawId = String(request.params.id);
    const id = /^\d{1,10}$/.test(rawId) ? Number(rawId) : 0;
    if (id < 1 || id > MAX_ID) {
      throw new HttpError(404, 'NOT_FOUND', 'Equipment type not found.');
    }
    const body = validateBody(equipmentTypeEditBodySchema, request.body);
    response.json(await types.update(response.locals.user!.id, id, body));
  };

  return { list, create, update };
}
