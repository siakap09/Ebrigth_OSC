'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { logAudit } from '@/lib/crm/audit'
import { normalizePhone } from '@/lib/crm/utils'
import {
  CreateContactSchema,
  UpdateContactSchema,
  type CreateContactInput,
  type UpdateContactInput,
} from '@/lib/crm/validations/contact'

// ─── Helper: resolve tenantId for the current session user ───────────────────

async function getSessionAndTenant(): Promise<{ userId: string; userEmail: string; tenantId: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })

  if (!userBranch) {
    throw new Error('User has no branch assignment')
  }

  return {
    userId: session.user.id,
    userEmail: session.user.email ?? '',
    tenantId: userBranch.tenantId,
  }
}

// ─── Action: createContact ────────────────────────────────────────────────────

export async function createContact(
  branchId: string,
  data: CreateContactInput,
): Promise<{ success: true; contactId: string } | { success: false; error: string }> {
  try {
    const { userId, userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    // Validate
    const parsed = CreateContactSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    const input = parsed.data

    // Normalize phone
    const normalizedPhone = input.phone ? normalizePhone(input.phone) : undefined

    // Check for duplicates by phone or email within this tenant
    if (normalizedPhone || (input.email && input.email !== '')) {
      const orClauses: Array<{ phone?: string; email?: string }> = []
      if (normalizedPhone) orClauses.push({ phone: normalizedPhone })
      if (input.email && input.email !== '') orClauses.push({ email: input.email })

      const existing = await prisma.crm_contact.findFirst({
        where: {
          ...scope.whereOnly(),
          deletedAt: null,
          OR: orClauses,
        },
        select: { id: true, firstName: true, lastName: true },
      })

      if (existing) {
        return {
          success: false,
          error: `Duplicate contact: ${existing.firstName}${existing.lastName ? ' ' + existing.lastName : ''} already exists with this phone/email.`,
        }
      }
    }

    // Create contact
    const { tagIds, ...contactData } = input
    const contact = await prisma.crm_contact.create({
      data: scope.data({
        branchId,
        ...contactData,
        phone: normalizedPhone ?? input.phone,
        email: input.email === '' ? null : input.email,
      }),
    })

    // Create contact tags
    if (tagIds && tagIds.length > 0) {
      await prisma.crm_contact_tag.createMany({
        data: tagIds.map((tagId) => ({
          contactId: contact.id,
          tagId,
        })),
        skipDuplicates: true,
      })
    }

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'CREATE',
      entity: 'crm_contact',
      entityId: contact.id,
      meta: { branchId, firstName: input.firstName },
    })

    revalidatePath('/crm/contacts')
    return { success: true, contactId: contact.id }
  } catch (err) {
    console.error('[createContact]', err)
    return { success: false, error: 'Failed to create contact' }
  }
}

// ─── Action: updateContact ────────────────────────────────────────────────────

export async function updateContact(
  contactId: string,
  data: UpdateContactInput,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    // Validate
    const parsed = UpdateContactSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }
    }

    const input = parsed.data

    // Normalize phone if provided
    const normalizedPhone = input.phone ? normalizePhone(input.phone) : undefined

    const { tagIds, ...updateData } = input

    await prisma.crm_contact.update({
      where: scope.where({ id: contactId, deletedAt: null }),
      data: {
        ...updateData,
        ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
        ...(input.email !== undefined ? { email: input.email === '' ? null : input.email } : {}),
      },
    })

    // If tagIds are provided, replace all tags
    if (tagIds !== undefined) {
      await prisma.crm_contact_tag.deleteMany({ where: { contactId } })
      if (tagIds.length > 0) {
        await prisma.crm_contact_tag.createMany({
          data: tagIds.map((tagId) => ({ contactId, tagId })),
          skipDuplicates: true,
        })
      }
    }

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'UPDATE',
      entity: 'crm_contact',
      entityId: contactId,
      meta: { updatedFields: Object.keys(input) },
    })

    revalidatePath('/crm/contacts')
    revalidatePath(`/crm/contacts/${contactId}`)
    return { success: true }
  } catch (err) {
    console.error('[updateContact]', err)
    return { success: false, error: 'Failed to update contact' }
  }
}

// ─── Action: deleteContact ────────────────────────────────────────────────────

export async function deleteContact(
  contactId: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    await prisma.crm_contact.update({
      where: scope.where({ id: contactId, deletedAt: null }),
      data: { deletedAt: new Date() },
    })

    void logAudit({
      tenantId,
      userId,
      userEmail,
      action: 'DELETE',
      entity: 'crm_contact',
      entityId: contactId,
    })

    revalidatePath('/crm/contacts')
    return { success: true }
  } catch (err) {
    console.error('[deleteContact]', err)
    return { success: false, error: 'Failed to delete contact' }
  }
}

// ─── Action: bulkAssignContacts ───────────────────────────────────────────────

export async function bulkAssignContacts(
  contactIds: string[],
  assignedUserId: string,
  requestingUserId: string,
): Promise<{ success: true; updated: number } | { success: false; error: string }> {
  try {
    const { userEmail, tenantId } = await getSessionAndTenant()
    const scope = scopedPrisma(tenantId)

    const result = await prisma.crm_contact.updateMany({
      where: scope.where({
        id: { in: contactIds },
        deletedAt: null,
      }),
      data: { assignedUserId },
    })

    void logAudit({
      tenantId,
      userId: requestingUserId,
      userEmail,
      action: 'UPDATE',
      entity: 'crm_contact',
      meta: { bulkAssign: true, contactIds, assignedUserId, count: result.count },
    })

    revalidatePath('/crm/contacts')
    return { success: true, updated: result.count }
  } catch (err) {
    console.error('[bulkAssignContacts]', err)
    return { success: false, error: 'Failed to bulk assign contacts' }
  }
}
