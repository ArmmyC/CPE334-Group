import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  CustodianEquipmentType,
  CustodianEquipmentTypesResponse,
  EquipmentTypeCreateBody,
  EquipmentTypeEditBody,
} from '@cpe334-group/shared';
import { HttpError } from '../http/errors.js';

const typeSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  loanPeriodDays: true,
  lab: { select: { id: true, name: true } },
} satisfies Prisma.EquipmentTypeSelect;

type TypeRow = Prisma.EquipmentTypeGetPayload<{ select: typeof typeSelect }>;

const toItem = (row: TypeRow): CustodianEquipmentType => row;

// BR-15: the labs the custodian is assigned to. The filter is part of every query, so a type in
// another lab is never read or changed.
const assignedTo = (custodianId: number) => ({ assignments: { some: { custodianId } } });

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Equipment type not found.');

const duplicateName = () =>
  new HttpError(409, 'DUPLICATE_NAME', 'A type with this name already exists in this lab.', {
    name: 'A type with this name already exists in this lab.',
  });

// The unique index on (lab, name) decides, so parallel requests cannot both succeed.
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function createEquipmentTypeService({ prisma }: { prisma: PrismaClient }) {
  return {
    async list(custodianId: number): Promise<CustodianEquipmentTypesResponse> {
      const labs = await prisma.lab.findMany({
        where: assignedTo(custodianId),
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      const items = await prisma.equipmentType.findMany({
        where: { lab: assignedTo(custodianId) },
        select: typeSelect,
        orderBy: [{ lab: { name: 'asc' } }, { lab: { id: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
      });
      return { labs, items: items.map(toItem) };
    },

    async create(
      custodianId: number,
      body: EquipmentTypeCreateBody,
    ): Promise<CustodianEquipmentType> {
      const lab = await prisma.lab.findFirst({
        where: { id: body.labId, ...assignedTo(custodianId) },
        select: { id: true },
      });
      if (!lab) throw notFound();
      try {
        return toItem(
          await prisma.equipmentType.create({
            data: {
              labId: body.labId,
              name: body.name,
              category: body.category,
              description: body.description,
              loanPeriodDays: body.loanPeriodDays,
            },
            select: typeSelect,
          }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw duplicateName();
        throw error;
      }
    },

    async update(
      custodianId: number,
      id: number,
      body: EquipmentTypeEditBody,
    ): Promise<CustodianEquipmentType> {
      const scoped = await prisma.equipmentType.findFirst({
        where: { id, lab: assignedTo(custodianId) },
        select: { id: true },
      });
      if (!scoped) throw notFound();
      try {
        return toItem(
          await prisma.equipmentType.update({ where: { id }, data: body, select: typeSelect }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw duplicateName();
        throw error;
      }
    },
  };
}

export type EquipmentTypeService = ReturnType<typeof createEquipmentTypeService>;
