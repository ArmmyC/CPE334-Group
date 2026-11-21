import type { RequestHandler } from 'express';
import { custodianLoansQuerySchema, returnLoanBodySchema } from '@cpe334-group/shared';
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

// Digits only, within the 32-bit integer range. Anything else cannot be a loan this custodian can
// see, so it gets the same 404 as a missing one (SDS 5.1).
function parseLoanId(value: string): number {
  const id = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new HttpError(404, 'NOT_FOUND', 'This loan could not be found.');
  }
  return id;
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

  // F-09. The id is checked first, so a bad id is a 404 before the body is read.
  const returnLoan: RequestHandler = async (request, response) => {
    const loanId = parseLoanId(String(request.params.id));
    const body = validateBody(returnLoanBodySchema, request.body);
    response.json(await loans.returnLoan(response.locals.user!.id, loanId, body));
  };

  return { list, listForCustodian, returnLoan };
}
