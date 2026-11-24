import { z } from 'zod';

// Request and response shapes for F-12 equipment type management (BR-05, FR-15), used by the API
// and the UI.

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

const loanPeriodDays = z
  .number({ error: 'Loan period must be a whole number from 1 to 14.' })
  .int('Loan period must be a whole number from 1 to 14.')
  .min(1, 'Loan period must be from 1 to 14 days.')
  .max(14, 'Loan period must be from 1 to 14 days.');

// The fields of an edit. The lab of an existing type cannot change.
export const equipmentTypeEditBodySchema = z.object({
  name: text('Name', 100),
  category: text('Category', 50),
  description: text('Description', 1000),
  loanPeriodDays,
});

export type EquipmentTypeEditBody = z.infer<typeof equipmentTypeEditBodySchema>;

// A create adds the lab. An omitted loan period is the default of 7 days (BR-05).
export const equipmentTypeCreateBodySchema = equipmentTypeEditBodySchema.extend({
  labId: z.number({ error: 'Choose a lab.' }).int('Choose a lab.').positive('Choose a lab.'),
  loanPeriodDays: loanPeriodDays.default(7),
});

export type EquipmentTypeCreateBody = z.infer<typeof equipmentTypeCreateBodySchema>;

const labRefSchema = z.object({ id: z.number().int().positive(), name: z.string() });

export const custodianEquipmentTypeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  loanPeriodDays: z.number().int().min(1).max(14),
  lab: labRefSchema,
});

export type CustodianEquipmentType = z.infer<typeof custodianEquipmentTypeSchema>;

export const custodianEquipmentTypesResponseSchema = z.object({
  labs: z.array(labRefSchema),
  items: z.array(custodianEquipmentTypeSchema),
});

export type CustodianEquipmentTypesResponse = z.infer<typeof custodianEquipmentTypesResponseSchema>;
