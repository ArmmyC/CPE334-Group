import { z } from 'zod';

// Request and response shapes for F-14, the custodian history view (FR-17), used by the API and
// the UI.

export const historyEntityTypeSchema = z.enum(['REQUEST', 'LOAN', 'COPY']);

export type HistoryEntityType = z.infer<typeof historyEntityTypeSchema>;

export const HISTORY_ENTITY_LABEL: Record<HistoryEntityType, string> = {
  REQUEST: 'Request',
  LOAN: 'Loan',
  COPY: 'Copy',
};

export const HISTORY_DEFAULT_LIMIT = 50;
export const HISTORY_MAX_LIMIT = 100;

export const historyEntrySchema = z.object({
  id: z.number().int().positive(),
  entityType: historyEntityTypeSchema,
  entityId: z.number().int().positive(),
  subject: z.string(),
  oldStatus: z.string().nullable(),
  newStatus: z.string(),
  createdAt: z.string(),
  actor: z.object({ id: z.number().int().positive(), name: z.string() }),
  lab: z.object({ id: z.number().int().positive(), name: z.string() }),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const historyResponseSchema = z.object({
  items: z.array(historyEntrySchema),
  nextBeforeId: z.number().int().positive().nullable(),
});

export type HistoryResponse = z.infer<typeof historyResponseSchema>;
