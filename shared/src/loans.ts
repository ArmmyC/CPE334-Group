import { z } from 'zod';

// Request and response shapes for F-05 active loan list (SDS 5.2), used by the API and the UI.

// Only ACTIVE is allowed in Sprint 1, and it is the default. The overdue filter is Sprint 2.
export const custodianLoansQuerySchema = z.object({
  status: z.literal('ACTIVE', { error: 'Use status=ACTIVE.' }).optional(),
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
});

export type CustodianLoan = z.infer<typeof custodianLoanSchema>;

export const custodianLoansResponseSchema = z.object({ items: z.array(custodianLoanSchema) });

export type CustodianLoansResponse = z.infer<typeof custodianLoansResponseSchema>;
