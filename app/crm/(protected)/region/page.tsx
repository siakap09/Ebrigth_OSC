import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Map } from 'lucide-react'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'

export const metadata = {
  title: 'Region | Ebright CRM',
}

/**
 * Region performance — role-aware scope.
 *
 *   • SUPER_ADMIN / AGENCY_ADMIN  (elevated)   → see every region in the tenant
 *   • REGIONAL_MANAGER            (scoped)     → see only the region(s) covered
 *                                                by their crm_user_branch links
 *   • anyone else                              → redirected to /crm/dashboard
 *                                                (the sidebar already hides the
 *                                                link, this is the URL-typing
 *                                                defence)
 *
 * Page body is intentionally a placeholder — the actual KPI layout will land
 * once the design is shared.
 */
export default async function RegionPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  if (!access) redirect('/crm/awaiting-access')

  let visibleRegions: string[]
  let scope: 'all' | 'regional'

  if (access.elevated) {
    // Super-admin / agency-admin — every region present in this tenant.
    const rows = await prisma.crm_branch.findMany({
      where: { tenantId: access.tenantId, region: { not: null } },
      select: { region: true },
      distinct: ['region'],
    })
    visibleRegions = rows
      .map((r) => r.region!)
      .sort((a, b) => a.localeCompare(b))
    scope = 'all'
  } else {
    // Not elevated — must be REGIONAL_MANAGER on at least one branch link, or
    // they don't belong on this page at all.
    const rmLink = await prisma.crm_user_branch.findFirst({
      where: { userId: session.user.id, role: 'REGIONAL_MANAGER' },
      select: { id: true },
    })
    if (!rmLink) redirect('/crm/dashboard')

    // Distinct regions among the branches they're linked to. Usually one.
    const branches = await prisma.crm_branch.findMany({
      where: { id: { in: access.branchIds }, region: { not: null } },
      select: { region: true },
      distinct: ['region'],
    })
    visibleRegions = branches
      .map((b) => b.region!)
      .sort((a, b) => a.localeCompare(b))
    scope = 'regional'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Map className="h-6 w-6 text-zinc-400" />
        <h1 className="text-2xl font-semibold">Region performance</h1>
      </div>
      <p className="text-sm text-zinc-400 mt-1">
        {scope === 'all'
          ? `All ${visibleRegions.length} region${visibleRegions.length === 1 ? '' : 's'} — super-admin view.`
          : `Your ${visibleRegions.length} region${visibleRegions.length === 1 ? '' : 's'} — regional-manager view.`}
      </p>

      {visibleRegions.length === 0 ? (
        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
          No branches in this tenant have a region assigned yet. Set a region
          (A / B / C) on each branch from the Branches page to populate this view.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {visibleRegions.map((r) => (
            <div
              key={r}
              className="rounded-lg border border-zinc-700 bg-zinc-900 p-5"
            >
              <h2 className="text-lg font-medium">Region {r}</h2>
              <p className="text-xs text-zinc-500 mt-2">
                Dashboard content pending — design will be plugged in here.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
