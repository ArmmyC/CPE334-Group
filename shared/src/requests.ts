import { z } from 'zod';

// Request and response shapes for F-03 borrow requests and loans (SDS 5.2), used by the API
// and the UI.

export const purposeMaxLength = 500;

// Ids are 32-bit integer columns, so a larger value cannot be a real equipment type.
const maxId = 2_147_483_647;

export const createRequestSchema = z.object({
  equipmentTypeId: z
    .number({ error: 'Choose an equipment type.' })
    .int('Choose an equipment type.')
    .positive('Choose an equipment type.')
    .max(maxId, 'Choose an equipment type.'),
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
  // F-08: the custodian's reason, null unless the request is Rejected.
  rejectionReason: z.string().nullable().default(null),
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

// F-08 reject a request (SDS 5.2). The reason is required, 1 to 500 characters after trimming.
export const rejectionReasonMaxLength = 500;

export const rejectRequestBodySchema = z.object({
  reason: z
    .string({ error: 'Enter a reason.' })
    .trim()
    .min(1, 'Enter a reason.')
    .max(rejectionReasonMaxLength, 'Use a reason of at most 500 characters.'),
});

export type RejectRequestBody = z.infer<typeof rejectRequestBodySchema>;

export const rejectRequestResultSchema = z.object({
  id: z.number().int(),
  status: z.literal('REJECTED'),
  rejectionReason: z.string(),
  decidedAt: z.string(),
});

export type RejectRequestResult = z.infer<typeof rejectRequestResultSchema>;
