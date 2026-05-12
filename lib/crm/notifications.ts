/**
 * In-app notifications helper.
 *
 * Writes rows to `crm_notification`. The GET /api/crm/notifications endpoint
 * filters by the authenticated `userId`, so branch scoping is achieved purely
 * by *which users* we fan a notification out to — there is no per-row
 * audience field.
 *
 * Recipients for NEW_LEAD:
 *   - Every user linked to the lead's branch via crm_user_branch
 *     (BRANCH_STAFF / BRANCH_MANAGER for that branch)
 *   - Every elevated user (SUPER_ADMIN / AGENCY_ADMIN) in the tenant —
 *     they see all branches regardless of branch links
 */

import type { PrismaClient } from '@prisma/client'

interface CreateLeadNotificationArgs {
  tenantId:   string
  branchId:   string
  contactId:  string
  leadName:   string
  leadSource: string | null
}

export async function createLeadNotifications(
  prisma: PrismaClient,
  args: CreateLeadNotificationArgs,
): Promise<number> {
  const { tenantId, branchId, contactId, leadName, leadSource } = args

  const links = await prisma.crm_user_branch.findMany({
    where: {
      tenantId,
      OR: [
        { branchId },
        { role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] } },
      ],
    },
    select: { userId: true },
  })

  if (links.length === 0) return 0

  // A super admin may also have an explicit branch link, which would yield
  // two rows for the same user. createMany would then insert two rows; dedupe
  // up-front so each recipient sees exactly one bell entry.
  const userIds = Array.from(new Set(links.map((l) => l.userId)))

  const body = leadSource
    ? `${leadName} submitted via ${leadSource}`
    : `${leadName} just came in`

  const result = await prisma.crm_notification.createMany({
    data: userIds.map((userId) => ({
      tenantId,
      userId,
      type:  'NEW_LEAD',
      title: 'New lead received',
      body,
      link:  `/crm/contacts/${contactId}`,
    })),
  })

  return result.count
}
