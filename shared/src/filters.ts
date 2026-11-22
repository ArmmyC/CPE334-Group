import { z } from 'zod';

// Query shapes for F-17 search and filter (FR-19), used by the API and the UI. Every value
// arrives as text, so an id must be digits only and within the 32-bit integer range.

const id = (label: string) =>
  z
    .string({ error: `${label} must be a whole number.` })
    .regex(/^\d{1,10}$/, `${label} must be a whole number.`)
    .transform(Number)
    .pipe(
      z
        .number()
        .min(1, `${label} must be a whole number.`)
        .max(2_147_483_647, `${label} must be a whole number.`),
    );

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .min(1, `${label} must be 1 to ${max} characters.`)
    .max(max, `${label} must be 1 to ${max} characters.`);

export const catalogQuerySchema = z.object({
  q: text('Search', 100).optional(),
  category: text('Category', 50).optional(),
  labId: id('Lab').optional(),
  available: z.literal('true', { error: 'Use available=true.' }).optional(),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

// Only Pending requests are listed, so PENDING is the only status value.
export const custodianRequestsQuerySchema = z.object({
  status: z.literal('PENDING', { error: 'Use status=PENDING.' }).optional(),
  labId: id('Lab').optional(),
  borrowerId: id('Borrower').optional(),
});

export type CustodianRequestsQuery = z.infer<typeof custodianRequestsQuerySchema>;

export const loanFilterShape = {
  labId: id('Lab').optional(),
  borrowerId: id('Borrower').optional(),
};
