import { z } from 'zod';

// Request and response shapes for F-06 copy maintenance status (SDS 5.2), used by the API and the UI.

export const copyStatusSchema = z.enum(['AVAILABLE', 'ON_LOAN', 'IN_MAINTENANCE', 'RETIRED']);

export type CopyStatus = z.infer<typeof copyStatusSchema>;

// The statuses a custodian can set. On loan comes only from checkout (F-04). Retired comes with
// F-13 and is final (BR-08).
export const changeableCopyStatusSchema = z.enum(['AVAILABLE', 'IN_MAINTENANCE', 'RETIRED'], {
  error: 'Choose Available, In maintenance, or Retired.',
});

export type ChangeableCopyStatus = z.infer<typeof changeableCopyStatusSchema>;

export const updateCopyStatusRequestSchema = z.object({ status: changeableCopyStatusSchema });

export type UpdateCopyStatusRequest = z.infer<typeof updateCopyStatusRequestSchema>;

// F-13: add a copy. The asset tag is unique across all labs (BR-12).
export const createCopyBodySchema = z.object({
  equipmentTypeId: z
    .number({ error: 'Choose an equipment type.' })
    .int('Choose an equipment type.')
    .positive('Choose an equipment type.'),
  assetTag: z
    .string({ error: 'Asset tag is required.' })
    .trim()
    .min(1, 'Asset tag is required.')
    .max(50, 'Asset tag must be at most 50 characters.'),
});

export type CreateCopyBody = z.infer<typeof createCopyBodySchema>;

export const custodianCopySchema = z.object({
  id: z.number().int().positive(),
  assetTag: z.string(),
  status: copyStatusSchema,
  equipmentType: z.object({ id: z.number().int().positive(), name: z.string() }),
  lab: z.object({ id: z.number().int().positive(), name: z.string() }),
});

export type CustodianCopy = z.infer<typeof custodianCopySchema>;

export const custodianCopiesResponseSchema = z.object({ items: z.array(custodianCopySchema) });

export type CustodianCopiesResponse = z.infer<typeof custodianCopiesResponseSchema>;

export const COPY_STATUS_LABEL: Record<CopyStatus, string> = {
  AVAILABLE: 'Available',
  ON_LOAN: 'On loan',
  IN_MAINTENANCE: 'In maintenance',
  RETIRED: 'Retired',
};
