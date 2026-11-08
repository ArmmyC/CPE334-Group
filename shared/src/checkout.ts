import { z } from 'zod';

// Request and response shapes for F-04 custodian checkout (SDS 5.2), used by the API and the UI.

export const pendingRequestSchema = z.object({
  id: z.number().int(),
  borrower: z.object({ id: z.number().int(), name: z.string() }),
  equipmentType: z.object({ id: z.number().int(), name: z.string() }),
  lab: z.object({ id: z.number().int(), name: z.string() }),
  purpose: z.string().nullable(),
  createdAt: z.string(),
});

export type PendingRequest = z.infer<typeof pendingRequestSchema>;

export const pendingRequestListSchema = z.object({ items: z.array(pendingRequestSchema) });

export const availableCopySchema = z.object({
  id: z.number().int(),
  assetTag: z.string(),
});

export type AvailableCopy = z.infer<typeof availableCopySchema>;

export const availableCopyListSchema = z.object({ items: z.array(availableCopySchema) });

export const checkoutBodySchema = z.object({
  copyId: z.number({ error: 'Choose a copy.' }).int('Choose a copy.').positive('Choose a copy.'),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;

export const checkoutResultSchema = z.object({
  id: z.number().int(),
  requestId: z.number().int(),
  borrower: z.object({ id: z.number().int(), name: z.string() }),
  equipmentType: z.object({ id: z.number().int(), name: z.string() }),
  lab: z.object({ id: z.number().int(), name: z.string() }),
  assetTag: z.string(),
  checkedOutAt: z.string(),
  dueDate: z.string(),
  status: z.literal('ACTIVE'),
});

export type CheckoutResult = z.infer<typeof checkoutResultSchema>;
