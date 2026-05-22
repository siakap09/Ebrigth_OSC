import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'

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

    const pipelines = await prisma.crm_pipeline.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            _count: { select: { opportunities: { where: { deletedAt: null } } } },
          },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ pipelines })
  } catch (err) {
    console.error('[GET /api/crm/pipelines]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
