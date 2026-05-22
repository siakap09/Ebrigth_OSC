'use server'

import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { z } from 'zod'

const StageUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: z.string().min(1).max(6).optional(),
  color: z.string().optional(),
  stuckHoursYellow: z.number().int().min(1).optional(),
  stuckHoursRed: z.number().int().min(1).optional(),
})

export async function reorderStages(
  tenantId: string,
  userId: string,
  pipelineId: string,
  orderedStageIds: string[],
) {
  const scope = scopedPrisma(tenantId)

  // Verify pipeline belongs to tenant
  const pipeline = await prisma.crm_pipeline.findFirst({
    where: scope.where({ id: pipelineId }),
    select: { id: true },
  })
  if (!pipeline) throw new Error('Pipeline not found')

  // Update order for each stage
  await prisma.$transaction(
    orderedStageIds.map((stageId, index) =>
      prisma.crm_stage.updateMany({
        where: { id: stageId, tenantId, pipelineId },
        data: { order: index, updatedAt: new Date() },
      }),
    ),
  )

  void logAudit({
    tenantId,
    userId,
    action: 'UPDATE',
    entity: 'crm_stage',
    meta: { action: 'reorder', pipelineId },
  })
}

export async function updateStage(
  tenantId: string,
  userId: string,
  stageId: string,
  data: z.infer<typeof StageUpdateSchema>,
) {
  const parsed = StageUpdateSchema.parse(data)
  const scope = scopedPrisma(tenantId)

  const stage = await prisma.crm_stage.findFirst({
    where: scope.where({ id: stageId }),
    select: { id: true },
  })
  if (!stage) throw new Error('Stage not found')

  const updated = await prisma.crm_stage.update({
    where: { id: stageId },
    data: { ...parsed, updatedAt: new Date() },
  })

  void logAudit({
    tenantId,
    userId,
    action: 'UPDATE',
    entity: 'crm_stage',
    entityId: stageId,
    meta: { fields: Object.keys(parsed) },
  })

  return updated
}

export async function deleteStage(
  tenantId: string,
  userId: string,
  stageId: string,
  reassignToStageId?: string,
) {
  const scope = scopedPrisma(tenantId)

  const stage = await prisma.crm_stage.findFirst({
    where: scope.where({ id: stageId }),
    select: { id: true, pipelineId: true },
  })
  if (!stage) throw new Error('Stage not found')

  // Reassign opportunities if needed
  if (reassignToStageId) {
    const targetStage = await prisma.crm_stage.findFirst({
      where: scope.where({ id: reassignToStageId }),
      select: { id: true },
    })
    if (!targetStage) throw new Error('Target stage not found')

    await prisma.crm_opportunity.updateMany({
      where: { stageId, tenantId, deletedAt: null },
      data: { stageId: reassignToStageId, updatedAt: new Date() },
    })
  }

  await prisma.crm_stage.delete({ where: { id: stageId } })

  void logAudit({
    tenantId,
    userId,
    action: 'DELETE',
    entity: 'crm_stage',
    entityId: stageId,
    meta: { reassignToStageId },
  })
}

export async function createStage(
  tenantId: string,
  userId: string,
  pipelineId: string,
  data: {
    name: string
    shortCode: string
    color?: string
    stuckHoursYellow?: number
    stuckHoursRed?: number
  },
) {
  const scope = scopedPrisma(tenantId)

  const pipeline = await prisma.crm_pipeline.findFirst({
    where: scope.where({ id: pipelineId }),
    select: { id: true },
  })
  if (!pipeline) throw new Error('Pipeline not found')

  // Get current max order
  const maxOrder = await prisma.crm_stage.aggregate({
    where: { pipelineId, tenantId },
    _max: { order: true },
  })
  const newOrder = (maxOrder._max.order ?? -1) + 1

  const stage = await prisma.crm_stage.create({
    data: {
      tenantId,
      pipelineId,
      name: data.name,
      shortCode: data.shortCode,
      color: data.color ?? '#6366f1',
      order: newOrder,
      stuckHoursYellow: data.stuckHoursYellow ?? 24,
      stuckHoursRed: data.stuckHoursRed ?? 48,
    },
  })

  void logAudit({
    tenantId,
    userId,
    action: 'CREATE',
    entity: 'crm_stage',
    entityId: stage.id,
    meta: { pipelineId, name: stage.name },
  })

  return stage
}
