import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { logAudit } from '@/lib/crm/audit'

async function resolveSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true },
  })
  if (!ub) return null
  return { tenantId: ub.tenantId, userId: session.user.id }
}

export async function GET() {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tags = await prisma.crm_tag.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ tags })
  } catch (err) {
    console.error('[GET /api/crm/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, color, branchId } = await req.json() as { name: string; color: string; branchId?: string }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 422 })

    const tag = await prisma.crm_tag.create({
      data: {
        tenantId: ctx.tenantId,
        name: name.trim(),
        color: color ?? '#3b82f6',
        branchId: branchId ?? null,
      },
    })

    void logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'CREATE', entity: 'crm_tag', entityId: tag.id })
    return NextResponse.json(tag, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/tags]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
