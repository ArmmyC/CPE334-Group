import { z } from 'zod';

// Request and response shapes for F-06 copy maintenance status (SDS 5.2), used by the API and the UI.

export const copyStatusSchema = z.enum(['AVAILABLE', 'ON_LOAN', 'IN_MAINTENANCE', 'RETIRED']);

export type CopyStatus = z.infer<typeof copyStatusSchema>;

// The statuses a custodian can set in Sprint 1. On loan comes only from checkout (F-04), and
// Retired is added with F-13 in Sprint 2.
export const changeableCopyStatusSchema = z.enum(['AVAILABLE', 'IN_MAINTENANCE'], {
  error: 'Choose Available or In maintenance.',
});

export type ChangeableCopyStatus = z.infer<typeof changeableCopyStatusSchema>;

export const updateCopyStatusRequestSchema = z.object({ status: changeableCopyStatusSchema });

export type UpdateCopyStatusRequest = z.infer<typeof updateCopyStatusRequestSchema>;

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
