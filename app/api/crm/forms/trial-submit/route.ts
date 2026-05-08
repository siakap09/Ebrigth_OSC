import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/crm/db'
import { logAudit } from '@/lib/crm/audit'

const SubmitSchema = z.object({
  parentName: z.string().min(1),
  parentPhone: z.string().min(1),
  parentEmail: z.string().email(),
  numChildren: z.number().int().min(1).max(4),
  children: z
    .array(
      z.object({
        name: z.string().min(1),
        age: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
  preferredBranch: z.string().min(1),
  remarks: z.string().optional(),
})

function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Match the preferredBranch label (e.g. "Selangor - Ampang") to a crm_branch.
 * Strategy: match against the branch name (case-insensitive), trying the part
 * after the last "-" first, then the full label.
 */
async function resolveBranchId(tenantId: string, preferredBranch: string): Promise<string | null> {
  // Exact match on the form's canonical branch list (seeded by prisma/seed-form-branches.ts)
  const branch = await prisma.crm_branch.findFirst({
    where: { tenantId, name: preferredBranch },
  })
  return branch?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = SubmitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    // Resolve default tenant. Production seed uses slug 'ebright'; the legacy
    // demo seed used 'ebright-demo'. Try both so this works in either env.
    const tenant = await prisma.crm_tenant.findFirst({
      where: { slug: { in: ['ebright', 'ebright-demo'] } },
      select: { id: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not configured' }, { status: 500 })
    }

    const branchId = await resolveBranchId(tenant.id, parsed.data.preferredBranch)
    if (!branchId) {
      return NextResponse.json({ error: 'No branches available — configure one first' }, { status: 409 })
    }

    // Find the "New Lead" stage — first stage of the branch's pipeline
    const pipeline = await prisma.crm_pipeline.findFirst({
      where: { tenantId: tenant.id, branchId },
      include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
    })
    if (!pipeline || pipeline.stages.length === 0) {
      return NextResponse.json(
        { error: 'No pipeline / New Lead stage exists for this branch' },
        { status: 409 },
      )
    }
    const newLeadStage = pipeline.stages[0]

    const { firstName, lastName } = splitName(parsed.data.parentName)

    // Build child data (firstName..4)
    const childData: Record<string, string> = {}
    parsed.data.children.forEach((c, idx) => {
      childData[`childName${idx + 1}`] = c.name
      childData[`childAge${idx + 1}`] = c.age
    })

    // Optional: lookup "Website" lead source, create if missing
    let leadSource = await prisma.crm_lead_source.findFirst({
      where: { tenantId: tenant.id, name: 'Website' },
    })
    if (!leadSource) {
      leadSource = await prisma.crm_lead_source.create({
        data: { tenantId: tenant.id, name: 'Website' },
      })
    }

    const contact = await prisma.$transaction(async (tx) => {
      const c = await tx.crm_contact.create({
        data: {
          tenantId: tenant.id,
          branchId,
          firstName,
          lastName,
          email: parsed.data.parentEmail,
          phone: parsed.data.parentPhone,
          leadSourceId: leadSource!.id,
          preferredBranchId: branchId,
          ...childData,
        },
      })

      await tx.crm_opportunity.create({
        data: {
          tenantId: tenant.id,
          branchId,
          contactId: c.id,
          pipelineId: pipeline.id,
          stageId: newLeadStage.id,
          value: 0,
        },
      })

      if (parsed.data.remarks?.trim()) {
        await tx.crm_note.create({
          data: {
            tenantId: tenant.id,
            contactId: c.id,
            body: parsed.data.remarks.trim(),
          },
        })
      }

      return c
    })

    void logAudit({
      tenantId: tenant.id,
      action: 'CREATE',
      entity: 'crm_contact',
      entityId: contact.id,
      meta: {
        source: 'trial-form',
        numChildren: parsed.data.numChildren,
        preferredBranch: parsed.data.preferredBranch,
      },
    })

    return NextResponse.json({ success: true, contactId: contact.id })
  } catch (e) {
    console.error('[POST /api/crm/forms/trial-submit]', e)
    return NextResponse.json({ error: (e as Error).message ?? 'Internal error' }, { status: 500 })
  }
}
