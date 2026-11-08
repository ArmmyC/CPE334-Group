import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['ok', 'unreachable']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// GET /api/ready: 200 once the database answers and every migration is applied (Lab 5).
export const readyResponseSchema = z.object({
  status: z.enum(['ready', 'not-ready']),
});

export type ReadyResponse = z.infer<typeof readyResponseSchema>;
