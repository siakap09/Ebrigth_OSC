'use server'

import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { z } from 'zod'

const RegionEnum = z.enum(['A', 'B', 'C']).nullable().optional()

const BranchSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  /** Short code surfaced on the dashboard bar chart + ticket module. */
  code: z.string().min(2).max(10).optional().nullable(),
  /** Region grouping for the per-branch dashboard widget. */
  region: RegionEnum,
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  timezone: z.string().default('Asia/Kuala_Lumpur'),
  branchManagerId: z.string().uuid().optional(),
  operatingHours: z
    .record(
      z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
      z.object({
        open: z.boolean(),
        openTime: z.string().optional(),
        closeTime: z.string().optional(),
      }),
    )
    .optional(),
})

type BranchInput = z.infer<typeof BranchSchema>

/** Canonical 16-stage lead pipeline copied to every new branch. Same metadata
 *  used by prisma/seed-from-powerbi.ts so seeded + UI-created branches stay
 *  identical. */
const LEAD_PIPELINE_STAGES = [
  { name: 'New Lead',              shortCode: 'NL',    color: 'slate'   },
  { name: 'Follow-Up 1st Attempt', shortCode: 'FU1',   color: 'slate'   },
  { name: 'Follow-Up 2nd Attempt', shortCode: 'FU2',   color: 'slate'   },
  { name: 'Follow-Up 3rd Attempt', shortCode: 'FU3',   color: 'slate'   },
  { name: 'Reschedule',            shortCode: 'RSD',   color: 'slate'   },
  { name: 'Confirmed for Trial',   shortCode: 'CT',    color: 'emerald' },
  { name: 'Confirmed No-Show',     shortCode: 'CNS',   color: 'amber'   },
  { name: 'Show-Up',               shortCode: 'SU',    color: 'emerald' },
  { name: 'Show-Up No-Enroll',     shortCode: 'SNE',   color: 'yellow'  },
  { name: 'Enrolled',              shortCode: 'ENR',   color: 'emerald' },
  { name: 'Unresponsive Week 1',   shortCode: 'UR_W1', color: 'slate'   },
  { name: 'Unresponsive Week 2',   shortCode: 'UR_W2', color: 'slate'   },
  { name: 'Unresponsive Week 3',   shortCode: 'UR_W3', color: 'slate'   },
  { name: 'Follow-Up 3 Months',    shortCode: 'FU3M',  color: 'slate'   },
  { name: 'Cold Lead',             shortCode: 'CL',    color: 'slate'   },
  { name: 'Do Not Disturb',        shortCode: 'DND',   color: 'red'     },
  { name: 'Buffer (OD use only)',  shortCode: 'SG',    color: 'indigo'  },
] as const

/** Extract the leading "NN" digit prefix from a "NN Ebright (Place)" name.
 *  Used to derive tkt_branch.branch_number when a super-admin adds a
 *  branch via the UI. Returns null when the format doesn't match — the
 *  caller falls back to skipping the tkt_branch row creation. */
function extractBranchNumberPrefix(name: string): string | null {
  const m = name.match(/^(\d{2})\b/)
  return m ? m[1] : null
}

export async function createBranch(
  tenantId: string,
  userId: string,
  data: BranchInput,
) {
  const parsed = BranchSchema.parse(data)

  // Create the crm_branch + pipeline + 16 stages + matching tkt_branch in
  // one transaction so a half-built branch never leaks into the UI. If
  // anything fails the whole thing rolls back.
  const result = await prisma.$transaction(async (tx) => {
    const branch = await tx.crm_branch.create({
      data: {
        tenantId,
        name:            parsed.name,
        code:            parsed.code ?? null,
        region:          parsed.region ?? null,
        address:         parsed.address ?? null,
        phone:           parsed.phone ?? null,
        email:           parsed.email || null,
        timezone:        parsed.timezone,
        branchManagerId: parsed.branchManagerId ?? null,
        operatingHours:  parsed.operatingHours ?? undefined,
      },
    })

    // Lead pipeline + 16 stages — required for the kanban to render this
    // branch as a column in any "All branches" / per-branch view.
    const pipeline = await tx.crm_pipeline.create({
      data: { tenantId, branchId: branch.id, name: branch.name },
      select: { id: true },
    })
    for (let i = 0; i < LEAD_PIPELINE_STAGES.length; i++) {
      const s = LEAD_PIPELINE_STAGES[i]
      await tx.crm_stage.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          name:       s.name,
          shortCode:  s.shortCode,
          color:      s.color,
          order:      i,
        },
      })
    }

    // tkt_branch — only when the name has a "NN" prefix AND a code is
    // supplied. Without both, the ticket module's UNIQUE constraint on
    // branch_number / code can't be satisfied cleanly, so we skip and
    // let an admin create the tkt_branch row via the existing
    // /crm/tkt-branches page if they want ticketing for the new branch.
    const branchNumber = extractBranchNumberPrefix(parsed.name)
    if (branchNumber && parsed.code) {
      const existing = await tx.tkt_branch.findFirst({
        where: { tenant_id: tenantId, branch_number: branchNumber },
        select: { id: true },
      })
      if (!existing) {
        await tx.tkt_branch.create({
          data: {
            tenant_id:     tenantId,
            name:          branch.name,
            code:          parsed.code,
            branch_number: branchNumber,
          },
        })
      }
    }

    return branch
  })

  void logAudit({
    tenantId,
    userId,
    action: 'CREATE',
    entity: 'crm_branch',
    entityId: result.id,
    meta: { name: result.name, code: result.code, region: result.region },
  })

  return result
}

export async function updateBranch(
  tenantId: string,
  userId: string,
  branchId: string,
  data: Partial<BranchInput>,
) {
  const scope = scopedPrisma(tenantId)

  const existing = await prisma.crm_branch.findFirst({
    where: scope.where({ id: branchId }),
    select: { id: true, name: true },
  })
  if (!existing) throw new Error('Branch not found')

  const branch = await prisma.crm_branch.update({
    where: { id: branchId },
    data: {
      ...(data.name    !== undefined ? { name:    data.name }            : {}),
      ...(data.code    !== undefined ? { code:    data.code ?? null }    : {}),
      ...(data.region  !== undefined ? { region:  data.region ?? null }  : {}),
      ...(data.address !== undefined ? { address: data.address }         : {}),
      ...(data.phone   !== undefined ? { phone:   data.phone }           : {}),
      ...(data.email   !== undefined ? { email:   data.email || null }   : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone }      : {}),
      ...(data.branchManagerId !== undefined ? { branchManagerId: data.branchManagerId ?? null } : {}),
      ...(data.operatingHours  !== undefined ? { operatingHours:  data.operatingHours  ?? undefined } : {}),
      updatedAt: new Date(),
    },
  })

  // If the name changed, keep the matching crm_pipeline + tkt_branch labels
  // in sync so users don't see a stale name in the kanban column header /
  // ticket form dropdown.
  if (data.name !== undefined && data.name !== existing.name) {
    await prisma.crm_pipeline.updateMany({
      where: { tenantId, branchId, name: existing.name },
      data:  { name: data.name },
    })
    const branchNumber = extractBranchNumberPrefix(data.name) ?? extractBranchNumberPrefix(existing.name)
    if (branchNumber) {
      await prisma.tkt_branch.updateMany({
        where: { tenant_id: tenantId, branch_number: branchNumber },
        data:  { name: data.name },
      })
    }
  }

  void logAudit({
    tenantId,
    userId,
    action: 'UPDATE',
    entity: 'crm_branch',
    entityId: branchId,
    meta: { fields: Object.keys(data) },
  })

  return branch
}
