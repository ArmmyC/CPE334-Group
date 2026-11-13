import type { PrismaClient } from '../generated/prisma/client.js';
import type { CatalogResponse, EquipmentTypeDetail } from '@cpe334-group/shared';

// Reads for F-02. Only catalog columns are selected, and the count of Available copies is
// part of the same query, so it is live (FR-04) and no loan or holder data is read (BR-16).
const typeSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  loanPeriodDays: true,
  lab: { select: { id: true, name: true } },
  _count: { select: { copies: { where: { status: 'AVAILABLE' as const } } } },
};

export function createCatalogService({ prisma }: { prisma: PrismaClient }) {
  return {
    async listCatalog(): Promise<CatalogResponse> {
      const types = await prisma.equipmentType.findMany({
        select: typeSelect,
        orderBy: [{ lab: { name: 'asc' } }, { lab: { id: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
      });
      const items: CatalogResponse['items'] = [];
      for (const type of types) {
        let group = items[items.length - 1];
        if (!group || group.lab.id !== type.lab.id) {
          group = { lab: type.lab, equipmentTypes: [] };
          items.push(group);
        }
        group.equipmentTypes.push({
          id: type.id,
          name: type.name,
          category: type.category,
          availableCount: type._count.copies,
        });
      }
      return { items };
    },

    async getEquipmentType(id: number): Promise<EquipmentTypeDetail | null> {
      const type = await prisma.equipmentType.findUnique({ where: { id }, select: typeSelect });
      if (!type) return null;
      return {
        id: type.id,
        name: type.name,
        category: type.category,
        description: type.description,
        loanPeriodDays: type.loanPeriodDays,
        lab: type.lab,
        availableCount: type._count.copies,
      };
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
