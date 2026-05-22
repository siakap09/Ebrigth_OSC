import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'

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

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['SUPER_ADMIN', 'AGENCY_ADMIN', 'BRANCH_MANAGER'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25')))
    const search = sp.get('search')
    const action = sp.get('action')
    const entity = sp.get('entity')
    const dateFrom = sp.get('dateFrom')
    const dateTo = sp.get('dateTo')

    const where = {
      tenantId: ctx.tenantId,
      ...(search ? {
        OR: [
          { userEmail: { contains: search, mode: 'insensitive' as const } },
          { userId: { contains: search } },
          { entity: { contains: search } },
        ],
      } : {}),
      ...(action ? { action } : {}),
      ...(entity ? { entity: { contains: entity } } : {}),
      ...(dateFrom || dateTo ? {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59Z') } : {}),
        },
      } : {}),
    }

    const [logs, total] = await Promise.all([
      prisma.core_audit_log.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.core_audit_log.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, pageSize })
  } catch (err) {
    console.error('[GET /api/crm/audit-log]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
