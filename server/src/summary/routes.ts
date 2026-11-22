import type { RequestHandler } from 'express';
import { summaryQuerySchema } from '@cpe334-group/shared';
import { checkQuery } from '../http/query.js';
import type { SummaryService } from './service.js';

// F-19: the range is checked strictly (SDS 5.1) and the custodian comes from the session.
export function summaryHandlers({ summary }: { summary: SummaryService }) {
  const get: RequestHandler = async (request, response) => {
    const query = checkQuery(summaryQuerySchema, ['from', 'to'], request.query);
    response.json(await summary.forCustodian(response.locals.user!.id, query));
  };
  return { get };
}
