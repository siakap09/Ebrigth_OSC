import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/crm/db'
import { normalizePhone } from '@/lib/crm/utils'
import { enqueueAutomation } from '@/lib/crm/queue'

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const form = await prisma.crm_website_form.findUnique({
    where: { publicSlug: slug },
    include: { branch: true },
  })
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

  const body = await req.json() as Record<string, string>

  // Map form fields to contact fields
  const firstName = (body.firstName ?? body.first_name ?? body.name ?? '').split(' ')[0] || 'Unknown'
  const lastName = (body.lastName ?? body.last_name ?? body.name ?? '').split(' ').slice(1).join(' ') || undefined
  const email = body.email || undefined
  const rawPhone = body.phone ?? body.mobile ?? ''
  const phone = rawPhone ? normalizePhone(rawPhone) : undefined

  // Find lead source for website
  const leadSource = await prisma.crm_lead_source.findFirst({
    where: { tenantId: form.tenantId, name: { contains: 'Website' } },
  })

  // Check for duplicate
  const existing = phone
    ? await prisma.crm_contact.findFirst({ where: { tenantId: form.tenantId, phone, deletedAt: null } })
    : email
    ? await prisma.crm_contact.findFirst({ where: { tenantId: form.tenantId, email, deletedAt: null } })
    : null

  let contactId: string

  if (existing) {
    contactId = existing.id
  } else {
    const contact = await prisma.crm_contact.create({
      data: {
        tenantId: form.tenantId,
        branchId: form.branchId,
        firstName,
        lastName,
        email,
        phone,
        leadSourceId: leadSource?.id,
        childName1: body.childName ?? body.child_name ?? undefined,
        childAge1: body.childAge ?? body.child_age ?? undefined,
        preferredBranchId: body.preferredBranch ?? undefined,
      },
    })
    contactId = contact.id
  }

  // Increment submission count
  await prisma.crm_website_form.update({
    where: { id: form.id },
    data: { submissionsCount: { increment: 1 } },
  })

  // Fire FORM_SUBMITTED automations
  const automations = await prisma.crm_automation.findMany({
    where: { tenantId: form.tenantId, enabled: true, triggerType: 'FORM_SUBMITTED' },
  })
  for (const auto of automations) {
    await enqueueAutomation({
      automationId: auto.id,
      contactId,
      tenantId: form.tenantId,
      triggeredBy: 'FORM_SUBMITTED',
      triggerPayload: { formId: form.id, slug, data: body },
    })
  }

  return NextResponse.json({ ok: true, contactId })
}
