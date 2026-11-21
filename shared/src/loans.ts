import { z } from 'zod';

// Request and response shapes for F-05 active loan list (SDS 5.2), used by the API and the UI.

// Only ACTIVE is allowed, and it is the default. `overdue=true` lists only overdue loans (F-10).
export const custodianLoansQuerySchema = z.object({
  status: z.literal('ACTIVE', { error: 'Use status=ACTIVE.' }).optional(),
  overdue: z.literal('true', { error: 'Use overdue=true.' }).optional(),
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
});

export type CustodianLoan = z.infer<typeof custodianLoanSchema>;

export const custodianLoansResponseSchema = z.object({ items: z.array(custodianLoanSchema) });

export type CustodianLoansResponse = z.infer<typeof custodianLoansResponseSchema>;
