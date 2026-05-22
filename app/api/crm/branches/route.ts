import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { createBranch } from '@/server/actions/branches'

// Always re-fetch so newly seeded branches (e.g. HR) appear without a hard refresh
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, role: true },
  })
  if (!ub) return null
  return { tenantId: ub.tenantId, userId: session.user.id, role: ub.role }
}

export async function GET() {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isAdmin = ctx.role === 'SUPER_ADMIN' || ctx.role === 'AGENCY_ADMIN'

    // Admins see every branch. Branch managers / staff see only the branches
    // they have an explicit crm_user_branch link to.
    const whereBranch = isAdmin
      ? { tenantId: ctx.tenantId }
      : {
          tenantId: ctx.tenantId,
          userBranches: { some: { userId: ctx.userId } },
        }

    const branches = await prisma.crm_branch.findMany({
      where: whereBranch,
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ branches, viewerRole: ctx.role })
  } catch (err) {
    console.error('[GET /api/crm/branches]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['SUPER_ADMIN', 'AGENCY_ADMIN'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const branch = await createBranch(ctx.tenantId, ctx.userId, body)
    return NextResponse.json(branch, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/branches]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
