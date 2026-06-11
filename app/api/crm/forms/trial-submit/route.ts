import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { auth } from '@/lib/crm/auth'
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

    // Branch-scope guard: a branch manager submitting from /crm/forms can only
    // create leads for branches they're explicitly linked to. The dropdown is
    // locked client-side; this is the server-side enforcement against people
    // editing the request payload in dev tools. Super/agency admins bypass.
    const session = await auth.api.getSession({ headers: await headers() })
    if (session?.user?.id) {
      const userBranch = await prisma.crm_user_branch.findFirst({
        where: { userId: session.user.id, tenantId: tenant.id },
        select: { role: true },
      })
      const isAdmin = userBranch?.role === 'SUPER_ADMIN' || userBranch?.role === 'AGENCY_ADMIN'
      if (!isAdmin) {
        const allowed = await prisma.crm_user_branch.findFirst({
          where: { userId: session.user.id, tenantId: tenant.id, branchId },
          select: { branchId: true },
        })
        if (!allowed) {
          return NextResponse.json(
            { error: 'You can only submit form leads for your own branch.' },
            { status: 403 },
          )
        }
      }
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

    // Leads submitted through the CRM trial form are tagged with the
    // "CRM Form" lead source so they're distinguishable in the Opportunities
    // board / lead-source filter (created on first use if missing).
    let leadSource = await prisma.crm_lead_source.findFirst({
      where: { tenantId: tenant.id, name: 'CRM Form' },
    })
    if (!leadSource) {
      leadSource = await prisma.crm_lead_source.create({
        data: { tenantId: tenant.id, name: 'CRM Form' },
      })
    }

    // One contact + opportunity PER child, mirroring the master_leads_base
    // sibling-explosion path. Each contact's firstName/lastName holds the
    // child's name; parentFullName carries the parent. externalSourceId uses
    // a single submission UUID + sibling index so the lead-detail page can
    // resolve siblings via the same `<uuid>#<idx>` scheme used for Wix.
    const submissionId = randomUUID()

    const contacts = await prisma.$transaction(async (tx) => {
      const created = []
      for (let i = 0; i < parsed.data.children.length; i++) {
        const child = parsed.data.children[i]
        const { firstName, lastName } = splitName(child.name)

        const c = await tx.crm_contact.create({
          data: {
            tenantId:            tenant.id,
            branchId,
            firstName,
            lastName,
            email:               parsed.data.parentEmail,
            phone:               parsed.data.parentPhone,
            leadSourceId:        leadSource!.id,
            preferredBranchId:   branchId,
            parentFullName:      parsed.data.parentName,
            childAge1:           child.age,
            externalSourceTable: 'trial_form',
            externalSourceId:    `${submissionId}#${i + 1}`,
          },
        })

        await tx.crm_opportunity.create({
          data: {
            tenantId:   tenant.id,
            branchId,
            contactId:  c.id,
            pipelineId: pipeline.id,
            stageId:    newLeadStage.id,
            value:      0,
          },
        })

        // Attach the parent's remarks to EVERY sibling's contact so the note
        // shows no matter which child's lead card the BM opens (previously it
        // was only on the first sibling, so the other cards looked empty).
        if (parsed.data.remarks?.trim()) {
          await tx.crm_note.create({
            data: {
              tenantId:  tenant.id,
              contactId: c.id,
              body:      parsed.data.remarks.trim(),
            },
          })
        }

        created.push(c)
      }
      return created
    })

    void logAudit({
      tenantId: tenant.id,
      action: 'CREATE',
      entity: 'crm_contact',
      entityId: contacts[0].id,
      meta: {
        source:           'trial-form',
        numChildren:      parsed.data.numChildren,
        preferredBranch:  parsed.data.preferredBranch,
        submissionId,
        contactIds:       contacts.map((c) => c.id),
      },
    })

    return NextResponse.json({
      success:    true,
      contactId:  contacts[0].id,
      contactIds: contacts.map((c) => c.id),
    })
  } catch (e) {
    console.error('[POST /api/crm/forms/trial-submit]', e)
    return NextResponse.json({ error: (e as Error).message ?? 'Internal error' }, { status: 500 })
  }
}
