import { z } from 'zod';

// Request and response shapes for F-01 sign-in (SDS 5.2 and 7.2), used by the API and the UI.

export const roleSchema = z.enum(['BORROWER', 'CUSTODIAN']);

export type Role = z.infer<typeof roleSchema>;

export const loginRequestSchema = z.object({
  email: z
    .string({ error: 'Enter your email address.' })
    .trim()
    .min(1, 'Enter your email address.')
    .max(254, 'Enter a valid email address.')
    .pipe(z.email('Enter a valid email address.')),
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, 'Enter your password.')
    .max(200, 'Use a password of at most 200 characters.'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const currentUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});

export type CurrentUser = z.infer<typeof currentUserSchema>;
