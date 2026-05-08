import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { DISPLAY_MIN_CREATED_AT } from '@/lib/crm/display-cutoff'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpportunityCard = {
  id: string
  tenantId: string
  branchId: string
  contactId: string
  pipelineId: string
  stageId: string
  value: string | number
  assignedUserId: string | null
  lastStageChangeAt: Date
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  contact: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
    phone: string | null
    childName1: string | null
    childAge1: string | null
    childName2: string | null
    childAge2: string | null
    parentFullName: string | null
    preferredBranchId: string | null
    leadSourceId: string | null
    leadSource: { id: string; name: string } | null
    contactTags: {
      tag: { id: string; name: string; color: string }
    }[]
  }
  assignedUser: {
    id: string
    name: string | null
    email: string
    image: string | null
  } | null
}

export type KanbanStage = {
  id: string
  tenantId: string
  pipelineId: string
  name: string
  shortCode: string
  order: number
  color: string
  stuckHoursYellow: number
  stuckHoursRed: number
  createdAt: Date
  updatedAt: Date
  opportunities: OpportunityCard[]
}

export type KanbanData = {
  stages: KanbanStage[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * When pipelineId starts with "all:<referenceId>", aggregate opportunities
 * from ALL pipelines in the tenant, grouped by stage NAME using the reference
 * pipeline's stage list as the column template (names are identical across
 * pipelines since they're cloned from the same template).
 */
export async function getAllBranchesKanban(
  tenantId: string,
  referencePipelineId: string,
  branchId?: string,
  search?: string,
): Promise<KanbanData> {
  const scope = scopedPrisma(tenantId)

  // Template stages from the reference pipeline — these are what we display as columns
  const referenceStages = await prisma.crm_stage.findMany({
    where: scope.where({ pipelineId: referencePipelineId }),
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      shortCode: true,
      color: true,
      order: true,
      stuckHoursYellow: true,
      stuckHoursRed: true,
    },
  })

  // Map every stage id in the tenant → its name (so we can group by name)
  const allStages = await prisma.crm_stage.findMany({
    where: scope.where({}),
    select: { id: true, name: true },
  })
  const stageNameById = new Map(allStages.map((s) => [s.id, s.name]))

  // Fetch every opportunity in the tenant (respecting branch + search filters)
  const opportunities = await prisma.crm_opportunity.findMany({
    where: {
      ...scope.where({}),
      deletedAt: null,
      createdAt: { gte: DISPLAY_MIN_CREATED_AT },
      ...(branchId ? { branchId } : {}),
      ...(search
        ? {
            contact: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          childName1: true,
          childAge1: true,
          childName2: true,
          childAge2: true,
          parentFullName: true,
          preferredBranchId: true,
          leadSourceId: true,
          leadSource: { select: { id: true, name: true } },
          contactTags: {
            include: { tag: { select: { id: true, name: true, color: true } } },
          },
        },
      },
      assignedUser: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  // Group by stage NAME
  const byStageName = new Map<string, typeof opportunities>()
  for (const o of opportunities) {
    const name = stageNameById.get(o.stageId)
    if (!name) continue
    const list = byStageName.get(name) ?? []
    list.push(o)
    byStageName.set(name, list)
  }

  // Build KanbanStage list using the reference template order + names
  const stages = referenceStages.map((s) => ({
    ...s,
    opportunities: byStageName.get(s.name) ?? [],
  }))

  return { stages: stages as unknown as KanbanStage[] }
}

export async function getPipelineKanban(
  tenantId: string,
  pipelineId: string,
  branchId?: string,
  search?: string,
): Promise<KanbanData> {
  // Synthetic "all:<referencePipelineId>" — aggregate across all pipelines
  if (pipelineId.startsWith('all:')) {
    const referenceId = pipelineId.slice(4)
    return getAllBranchesKanban(tenantId, referenceId, branchId, search)
  }

  const scope = scopedPrisma(tenantId)

  const stages = await prisma.crm_stage.findMany({
    where: scope.where({ pipelineId }),
    orderBy: { order: 'asc' },
    include: {
      opportunities: {
        where: {
          deletedAt: null,
          createdAt: { gte: DISPLAY_MIN_CREATED_AT },
          ...(branchId ? { branchId } : {}),
          ...(search
            ? {
                contact: {
                  OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                  ],
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              childName1: true,
              childAge1: true,
              childName2: true,
              childAge2: true,
              parentFullName: true,
              preferredBranchId: true,
              leadSourceId: true,
              leadSource: {
                select: { id: true, name: true },
              },
              contactTags: {
                include: {
                  tag: {
                    select: { id: true, name: true, color: true },
                  },
                },
              },
            },
          },
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  })

  // Map Prisma Decimal -> string|number on opportunity.value to match the
  // KanbanStage / OpportunityCard public type. Decimal carries extra runtime
  // surface that the UI doesn't need.
  const mapped = stages.map((s) => ({
    ...s,
    opportunities: s.opportunities.map((o) => ({
      ...o,
      value: o.value == null ? null : Number(o.value),
    })),
  })) as unknown as KanbanStage[]

  return { stages: mapped }
}

export async function getPipelinesByBranch(
  tenantId: string,
  branchId: string,
) {
  const scope = scopedPrisma(tenantId)

  return prisma.crm_pipeline.findMany({
    where: scope.where({ branchId }),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      branchId: true,
      tenantId: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function getOpportunityById(
  tenantId: string,
  opportunityId: string,
) {
  const scope = scopedPrisma(tenantId)

  return prisma.crm_opportunity.findFirst({
    where: scope.where({ id: opportunityId, deletedAt: null }),
    include: {
      contact: {
        include: {
          leadSource: true,
          contactTags: { include: { tag: true } },
        },
      },
      stage: true,
      pipeline: true,
      assignedUser: {
        select: { id: true, name: true, email: true, image: true },
      },
      stageHistory: {
        include: {
          fromStage: true,
          toStage: true,
          changedByUser: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { changedAt: 'desc' },
      },
    },
  })
}

export async function getAllPipelinesForTenant(tenantId: string) {
  return prisma.crm_pipeline.findMany({
    where: { tenantId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
      },
      branch: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
