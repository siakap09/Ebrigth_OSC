import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { TicketKanbanBoard, type TicketCard, type PlatformOption } from '@/components/crm/tickets/TicketKanbanBoard'

export const dynamic = 'force-dynamic'

/**
 * Ticket System kanban — opportunity-style view of every ticket in the tenant
 * grouped by status. Super-admin / agency-admin only. Branch managers and HR
 * have no business reordering tickets across the funnel.
 *
 * Stages map 1:1 to tkt_ticket.status:
 *   received    → "New Ticket Received"
 *   approved    → "Approved"
 *   rejected    → "Rejected"
 *   in_progress → "In Progress"
 *   complete    → "Finish"
 *
 * URL `?branch=NN` scopes the board to a single branch — driven by the topbar
 * branch switcher (see TicketKanbanBoard's branch-context sync).
 */
export default async function TicketKanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const sp = await searchParams
  const branchNumber = sp.branch ?? null
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  if (!access) redirect('/login')

  // Hard role gate — only elevated CRM roles see the board.
  const hrmsRole = (session.user as { role?: string } | undefined)?.role
  const adminViaCrm = access.elevated
  const adminViaHrms = hrmsRole === 'SUPER_ADMIN' || hrmsRole === 'AGENCY_ADMIN'
  if (!adminViaCrm && !adminViaHrms) {
    redirect('/crm/tickets')
  }

  const { tenantId } = access

  // Pull every active ticket. The "Finish" column can have thousands; we cap
  // it at 200 most-recent here and rely on the kanban's virtualization for
  // smooth scroll. Open columns are usually small.
  const branchFilter = branchNumber
    ? { branch: { branch_number: branchNumber } }
    : {}

  const [open, finished, platformsRaw] = await Promise.all([
    prisma.tkt_ticket.findMany({
      where: { tenant_id: tenantId, status: { not: 'complete' }, ...branchFilter },
      orderBy: { created_at: 'desc' },
      take: 1000,
      select: {
        id: true,
        ticket_number: true,
        status: true,
        sub_type: true,
        created_at: true,
        platform: { select: { id: true, name: true, slug: true, code: true, accent_color: true } },
        branch:   { select: { id: true, name: true, branch_number: true, code: true } },
      },
    }),
    prisma.tkt_ticket.findMany({
      where: { tenant_id: tenantId, status: 'complete', ...branchFilter },
      orderBy: { completed_at: 'desc' },
      take: 200,
      select: {
        id: true,
        ticket_number: true,
        status: true,
        sub_type: true,
        created_at: true,
        platform: { select: { id: true, name: true, slug: true, code: true, accent_color: true } },
        branch:   { select: { id: true, name: true, branch_number: true, code: true } },
      },
    }),
    prisma.tkt_platform.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, code: true, accent_color: true },
    }),
  ])

  const tickets: TicketCard[] = [...open, ...finished].map((t) => ({
    id: t.id,
    ticketNumber: t.ticket_number,
    status: t.status,
    subType: t.sub_type,
    createdAt: t.created_at.toISOString(),
    platform: {
      id: t.platform.id,
      name: t.platform.name,
      slug: t.platform.slug,
      code: t.platform.code,
      accentColor: t.platform.accent_color,
    },
    branch: {
      id: t.branch.id,
      name: t.branch.name,
      branchNumber: t.branch.branch_number,
      code: t.branch.code,
    },
  }))

  const platforms: PlatformOption[] = platformsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    code: p.code,
    accentColor: p.accent_color,
  }))

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Ticket System</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tickets.length.toLocaleString()} tickets in view
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <TicketKanbanBoard tickets={tickets} platforms={platforms} />
      </div>
    </div>
  )
}
