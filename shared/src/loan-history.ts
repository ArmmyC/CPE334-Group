import { z } from 'zod';
import { idParam } from './filters.js';

// F-18 loan history of a copy or a borrower (FR-20), used by the API and the UI.

export const LOAN_HISTORY_DEFAULT_LIMIT = 50;
export const LOAN_HISTORY_MAX_LIMIT = 100;

// `limit` is 1 to 100 and `beforeId` is the id of the last loan of the previous page.
export const loanHistoryQuerySchema = z.object({
  limit: idParam('Limit')
    .pipe(
      z.number().max(LOAN_HISTORY_MAX_LIMIT, `Limit must be from 1 to ${LOAN_HISTORY_MAX_LIMIT}.`),
    )
    .optional(),
  beforeId: idParam('Before id').optional(),
});

export type LoanHistoryQuery = z.infer<typeof loanHistoryQuerySchema>;

const refSchema = z.object({ id: z.number().int().positive(), name: z.string() });

export const loanHistoryItemSchema = z.object({
  id: z.number().int().positive(),
  borrower: refSchema,
  assetTag: z.string(),
  equipmentType: refSchema,
  lab: refSchema,
  checkedOutAt: z.string(),
  dueDate: z.string(),
  status: z.enum(['ACTIVE', 'RETURNED']),
  returnedAt: z.string().nullable(),
  returnNote: z.string().nullable(),
  renewed: z.boolean(),
});

export type LoanHistoryItem = z.infer<typeof loanHistoryItemSchema>;

export const loanHistoryResponseSchema = z.object({
  items: z.array(loanHistoryItemSchema),
  nextBeforeId: z.number().int().positive().nullable(),
});

export type LoanHistoryResponse = z.infer<typeof loanHistoryResponseSchema>;
