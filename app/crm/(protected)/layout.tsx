import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { isPreviewMode } from '@/lib/crm/preview-mode'
import { CrmProviders } from '@/components/crm/providers'
import { CrmShell } from '@/components/crm/shell'

export const metadata = {
  title: 'Ebright CRM',
  description: 'Customer Relationship Management — Ebright',
}

export default async function CrmProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  // Preview bypass is hard-gated to non-production by isPreviewMode().
  const previewMode = isPreviewMode()

  if (!session && !previewMode) {
    redirect('/login')
  }

  // Load ticket-module role + branch assignments so the shell can filter nav.
  // Swallow DB errors — a flaky connection shouldn't crash the whole page.
  let tktRole: string | null = null
  let tktBranchIds: string[] = []
  let hasBranchLink = false
  if (session?.user?.id) {
    try {
      const profile = await prisma.tkt_user_profile.findUnique({
        where: { user_id: session.user.id },
        include: { branches: { select: { branch_id: true } } },
      })
      tktRole = profile?.role ?? null
      tktBranchIds = profile?.branches.map((b) => b.branch_id) ?? []
    } catch (e) {
      console.warn('[CRM layout] Failed to load tkt profile:', (e as Error).message)
    }

    // If the user has no tkt profile (or is a regular tkt user) but is a CRM
    // admin, treat them as ticket super_admin so the Ticket sidebar exposes
    // Dashboard / Platforms / Branches / Users. Source of truth for "admin"
    // is the crm_user_branch role on any of their branch links.
    let hasAdminLink = false
    try {
      const adminLink = await prisma.crm_user_branch.findFirst({
        where: {
          userId: session.user.id,
          role: { in: ['SUPER_ADMIN', 'AGENCY_ADMIN'] },
        },
        select: { id: true },
      })
      if (adminLink) {
        hasAdminLink = true
        if (!tktRole || tktRole === 'user') tktRole = 'super_admin'
      }
    } catch (e) {
      console.warn('[CRM layout] Failed to load admin link:', (e as Error).message)
    }

    // Awaiting-access gate: a real (non-preview) user with no branch link
    // can't be safely scoped to a tenant. Send them to the splash so they
    // know to ask an admin instead of seeing empty-state pages everywhere.
    // Admin links above already count, so super/agency admins always pass.
    try {
      if (hasAdminLink) {
        hasBranchLink = true
      } else {
        const anyLink = await prisma.crm_user_branch.findFirst({
          where: { userId: session.user.id },
          select: { id: true },
        })
        hasBranchLink = !!anyLink
      }
    } catch (e) {
      // DB hiccup — fail open so a transient outage doesn't lock everyone out.
      console.warn('[CRM layout] Failed to check branch link:', (e as Error).message)
      hasBranchLink = true
    }

    if (!hasBranchLink && !previewMode) {
      redirect('/crm/awaiting-access')
    }
  }

  const sessionProp = session
    ? {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name ?? null,
          tktRole,
          tktBranchIds,
        },
      }
    : {
        user: {
          id: 'preview-user',
          email: 'preview@ebright.my',
          name: 'Preview User',
          tktRole: 'super_admin' as const,
          tktBranchIds: [],
        },
      }

  return (
    <CrmProviders session={sessionProp}>
      <CrmShell session={sessionProp}>{children}</CrmShell>
    </CrmProviders>
  )
}
