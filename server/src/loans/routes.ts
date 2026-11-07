import type { RequestHandler } from 'express';
import type { LoanService } from './service.js';

export function loanHandlers({ loans }: { loans: LoanService }) {
  const list: RequestHandler = async (_request, response) => {
    response.json(await loans.listOwn(response.locals.user!.id));
  };

  return { list };
}
