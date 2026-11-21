import type { Prisma } from '@prisma/client';
import { HttpError } from '../http/errors.js';
import { isOverdue } from './overdue.js';

// F-11 (BR-10, BR-11). Every function reads through the caller's transaction, which already
// holds the borrower row lock (SDS 2.5), so two parallel requests cannot both pass at 2.
export const MAX_ACTIVE_LOANS = 3;

export const hasOverdueLoanError = () =>
  new HttpError(
    409,
    'HAS_OVERDUE_LOAN',
    'You have an overdue loan. Return it before you borrow more.',
  );

export const loanLimitError = () =>
  new HttpError(409, 'LOAN_LIMIT_REACHED', 'You already have 3 active loans or Pending requests.');

// BR-11: any active loan whose due date is before today in Asia/Bangkok (F-10).
export async function assertNoOverdueLoan(
  tx: Prisma.TransactionClient,
  borrowerId: number,
  now: Date,
): Promise<void> {
  const active = await tx.loan.findMany({
    where: { borrowerId, status: 'ACTIVE' },
    select: { dueDate: true },
  });
  if (active.some((loan) => isOverdue(loan.dueDate, now))) {
    throw hasOverdueLoanError();
  }
}

// BR-10 on a new request: active loans plus Pending requests must stay below the limit.
export async function assertBelowLimitWithPending(
  tx: Prisma.TransactionClient,
  borrowerId: number,
): Promise<void> {
  const active = await tx.loan.count({ where: { borrowerId, status: 'ACTIVE' } });
  const pending = await tx.borrowRequest.count({ where: { borrowerId, status: 'PENDING' } });
  if (active + pending >= MAX_ACTIVE_LOANS) {
    throw loanLimitError();
  }
}

// BR-10 on checkout: Pending requests do not count, because the one being fulfilled is among them.
export async function assertBelowLimitActiveOnly(
  tx: Prisma.TransactionClient,
  borrowerId: number,
): Promise<void> {
  const active = await tx.loan.count({ where: { borrowerId, status: 'ACTIVE' } });
  if (active >= MAX_ACTIVE_LOANS) {
    throw loanLimitError();
  }
}
