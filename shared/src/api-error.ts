import { z } from 'zod';

// Every API error uses this shape (SRS NFR-07). `fields` maps a field name to its
// validation message and is present only for validation errors.
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function apiError(code: string, message: string, fields?: Record<string, string>): ApiError {
  return { error: fields ? { code, message, fields } : { code, message } };
}
