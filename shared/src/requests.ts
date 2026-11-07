import { z } from 'zod';

// Request and response shapes for F-03 borrow requests and loans (SDS 5.2), used by the API
// and the UI.

export const purposeMaxLength = 500;

export const createRequestSchema = z.object({
  equipmentTypeId: z
    .number({ error: 'Choose an equipment type.' })
    .int('Choose an equipment type.')
    .positive('Choose an equipment type.'),
  purpose: z
    .string({ error: 'Enter a purpose or leave it empty.' })
    .max(purposeMaxLength, 'Use a purpose of at most 500 characters.')
    .nullish(),
});

export type CreateRequest = z.infer<typeof createRequestSchema>;

export const requestStatusSchema = z.enum(['PENDING', 'FULFILLED', 'REJECTED', 'CANCELLED']);

export const borrowRequestSchema = z.object({
  id: z.number().int(),
  equipmentType: z.object({ id: z.number().int(), name: z.string() }),
  lab: z.object({ name: z.string() }),
  purpose: z.string().nullable(),
  status: requestStatusSchema,
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});

export type BorrowRequest = z.infer<typeof borrowRequestSchema>;

export const loanSchema = z.object({
  id: z.number().int(),
  equipmentType: z.object({ id: z.number().int(), name: z.string() }),
  assetTag: z.string(),
  checkedOutAt: z.string(),
  dueDate: z.string(),
  status: z.enum(['ACTIVE', 'RETURNED']),
});

export type Loan = z.infer<typeof loanSchema>;
