import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['ok', 'unreachable']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
