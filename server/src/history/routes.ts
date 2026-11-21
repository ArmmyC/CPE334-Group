import type { RequestHandler } from 'express';
import {
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  historyEntityTypeSchema,
} from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import type { HistoryViewService } from './view.js';

const MAX_ID = 2_147_483_647;

// HTTP handler for F-14. The query is checked here, strictly (SDS 5.1): an unknown parameter or
// a bad value is a 400 with the parameter named. The custodian comes from the session.
export function historyViewHandlers({ history }: { history: HistoryViewService }) {
  const list: RequestHandler = async (request, response) => {
    const fields: Record<string, string> = {};
    const query = request.query as Record<string, unknown>;
    for (const name of Object.keys(query)) {
      if (!['entityType', 'limit', 'beforeId'].includes(name)) fields[name] = 'Unknown parameter.';
    }

    const one = (name: string): string | undefined => {
      const value = query[name];
      if (value === undefined) return undefined;
      if (typeof value !== 'string') {
        fields[name] = 'Use one value.';
        return undefined;
      }
      return value;
    };

    const rawType = one('entityType');
    const parsedType =
      rawType === undefined ? undefined : historyEntityTypeSchema.safeParse(rawType);
    if (parsedType && !parsedType.success) fields.entityType = 'Use REQUEST, LOAN, or COPY.';

    let limit = HISTORY_DEFAULT_LIMIT;
    const rawLimit = one('limit');
    if (rawLimit !== undefined) {
      const value = /^\d{1,4}$/.test(rawLimit) ? Number(rawLimit) : 0;
      if (value < 1 || value > HISTORY_MAX_LIMIT) {
        fields.limit = `Use a whole number from 1 to ${HISTORY_MAX_LIMIT}.`;
      } else {
        limit = value;
      }
    }

    let beforeId: number | undefined;
    const rawBefore = one('beforeId');
    if (rawBefore !== undefined) {
      const value = /^\d{1,10}$/.test(rawBefore) ? Number(rawBefore) : 0;
      if (value < 1 || value > MAX_ID) fields.beforeId = 'Use a positive whole number.';
      else beforeId = value;
    }

    if (Object.keys(fields).length > 0) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);
    }
    response.json(
      await history.list(response.locals.user!.id, {
        entityType: parsedType?.success ? parsedType.data : undefined,
        limit,
        beforeId,
      }),
    );
  };

  return { list };
}
