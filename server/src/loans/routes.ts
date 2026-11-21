import type { RequestHandler } from 'express';
import { custodianLoansQuerySchema } from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { validateBody } from '../http/validate.js';
import type { LoanService } from './service.js';

// `status` and `overdue` are the known parameters. The lab and borrower filters come in Sprint 3,
// and an unknown parameter is refused (SDS 5.1).
function checkCustodianListQuery(query: Record<string, unknown>) {
  const unknown = Object.keys(query).filter((key) => key !== 'status' && key !== 'overdue');
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the highlighted fields.',
      Object.fromEntries(unknown.map((name) => [name, 'Unknown parameter.'])),
    );
  }
  return validateBody(custodianLoansQuerySchema, query);
}

export function loanHandlers({ loans }: { loans: LoanService }) {
  const list: RequestHandler = async (_request, response) => {
    response.json(await loans.listOwn(response.locals.user!.id));
  };

  // F-05. The custodian comes from the session, never from the request (SDS 2.4).
  const listForCustodian: RequestHandler = async (request, response) => {
    const query = checkCustodianListQuery(request.query);
    response.json({
      items: await loans.listActiveForCustodian(response.locals.user!.id, {
        overdueOnly: query.overdue === 'true',
      }),
    });
  };

  return { list, listForCustodian };
}
