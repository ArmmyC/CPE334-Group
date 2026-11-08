import type { RequestHandler } from 'express';
import { HttpError } from '../http/errors.js';
import type { CatalogService } from './service.js';

// The largest value of a PostgreSQL integer column. A larger id cannot exist.
const MAX_ID = 2_147_483_647;

// Sprint 1 has no catalog filters, so any query parameter is refused (SDS 5.1).
function refuseQueryParameters(query: Record<string, unknown>): void {
  const names = Object.keys(query);
  if (names.length === 0) return;
  const fields: Record<string, string> = {};
  for (const name of names) {
    fields[name] = 'This parameter is not supported.';
  }
  throw new HttpError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);
}

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Equipment type not found.');

// HTTP handlers for F-02. They translate requests to catalog service calls.
export function catalogHandlers({ catalog }: { catalog: CatalogService }) {
  const list: RequestHandler = async (request, response) => {
    refuseQueryParameters(request.query);
    response.json(await catalog.listCatalog());
  };

  const detail: RequestHandler = async (request, response) => {
    refuseQueryParameters(request.query);
    const raw = String(request.params.id);
    const id = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (id < 1 || id > MAX_ID) throw notFound();
    const type = await catalog.getEquipmentType(id);
    if (!type) throw notFound();
    response.json(type);
  };

  return { list, detail };
}
