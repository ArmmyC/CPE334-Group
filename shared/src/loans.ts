import { z } from 'zod';
import { loanFilterShape } from './filters.js';

// Request and response shapes for F-05 active loan list (SDS 5.2), used by the API and the UI.

// Only ACTIVE is allowed, and it is the default. `overdue=true` lists only overdue loans (F-10).
export const custodianLoansQuerySchema = z.object({
  status: z.literal('ACTIVE', { error: 'Use status=ACTIVE.' }).optional(),
  overdue: z.literal('true', { error: 'Use overdue=true.' }).optional(),
  ...loanFilterShape,
});

export type CustodianLoansQuery = z.infer<typeof custodianLoansQuerySchema>;

export const custodianLoanSchema = z.object({
  id: z.number().int(),
  borrower: z.object({ id: z.number().int(), name: z.string() }),
  equipmentType: z.object({ id: z.number().int(), name: z.string() }),
  lab: z.object({ id: z.number().int(), name: z.string() }),
  assetTag: z.string(),
  // An ISO timestamp, shown in Asia/Bangkok.
  checkedOutAt: z.string(),
  // A calendar date as YYYY-MM-DD (SDS 8).
  dueDate: z.string(),
  status: z.literal('ACTIVE'),
  // F-10: calculated when read from the due date, never stored (BR-09).
  overdue: z.boolean().default(false),
  // F-16: true once the loan has been renewed (BR-14).
  renewed: z.boolean().default(false),
});

export type CustodianLoan = z.infer<typeof custodianLoanSchema>;

export const custodianLoansResponseSchema = z.object({ items: z.array(custodianLoanSchema) });

export type CustodianLoansResponse = z.infer<typeof custodianLoansResponseSchema>;

// F-09 return a loan (SDS 5.2). The note is required, 1 to 500 characters after trimming.
export const returnNoteMaxLength = 500;

export const returnLoanBodySchema = z.object({
  note: z
    .string({ error: 'Enter a note about the condition.' })
    .trim()
    .min(1, 'Enter a note about the condition.')
    .max(returnNoteMaxLength, 'Use a note of at most 500 characters.'),
  damaged: z.boolean({ error: 'Use true or false.' }).default(false),
});

export type ReturnLoanBody = z.infer<typeof returnLoanBodySchema>;

export const returnLoanResultSchema = z.object({
  id: z.number().int(),
  status: z.literal('RETURNED'),
  returnedAt: z.string(),
  copy: z.object({
    id: z.number().int(),
    assetTag: z.string(),
    status: z.enum(['AVAILABLE', 'IN_MAINTENANCE']),
  }),
});

export type ReturnLoanResult = z.infer<typeof returnLoanResultSchema>;

// F-16 renew a loan (SDS 5.2). No request body; the result carries the new due date.
export const renewLoanResultSchema = z.object({
  id: z.number().int(),
  // A calendar date as YYYY-MM-DD (SDS 8).
  dueDate: z.string(),
  renewedAt: z.string(),
});

export type RenewLoanResult = z.infer<typeof renewLoanResultSchema>;
