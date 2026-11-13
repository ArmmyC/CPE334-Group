import { z } from 'zod';

// Response shapes for F-02 (SDS 5.2), used by the API and the UI. They hold catalog fields
// only, so no borrower, loan, or holder data can pass through them (BR-16).

const labRefSchema = z.object({ id: z.number().int().positive(), name: z.string() });

export const catalogTypeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  category: z.string(),
  availableCount: z.number().int().min(0),
});

export type CatalogType = z.infer<typeof catalogTypeSchema>;

export const catalogResponseSchema = z.object({
  items: z.array(z.object({ lab: labRefSchema, equipmentTypes: z.array(catalogTypeSchema) })),
});

export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

export const equipmentTypeDetailSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  loanPeriodDays: z.number().int().min(1).max(30),
  lab: labRefSchema,
  availableCount: z.number().int().min(0),
});

export type EquipmentTypeDetail = z.infer<typeof equipmentTypeDetailSchema>;
