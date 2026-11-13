import type { RequestHandler } from 'express';
import { custodianLoansQuerySchema } from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';
import { validateBody } from '../http/validate.js';
import type { LoanService } from './service.js';

// Only `status` is a known parameter in Sprint 1. The overdue, lab, and borrower filters come
// later, and an unknown parameter is refused (SDS 5.1).
function checkCustodianListQuery(query: Record<string, unknown>) {
  const unknown = Object.keys(query).filter((key) => key !== 'status');
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the highlighted fields.',
      Object.fromEntries(unknown.map((name) => [name, 'Unknown parameter.'])),
    );
  }
  validateBody(custodianLoansQuerySchema, query);
}

export function loanHandlers({ loans }: { loans: LoanService }) {
  const list: RequestHandler = async (_request, response) => {
    response.json(await loans.listOwn(response.locals.user!.id));
  };

  // F-05. The custodian comes from the session, never from the request (SDS 2.4).
  const listForCustodian: RequestHandler = async (request, response) => {
    checkCustodianListQuery(request.query);
    response.json({ items: await loans.listActiveForCustodian(response.locals.user!.id) });
  };

  return { list, listForCustodian };
}
