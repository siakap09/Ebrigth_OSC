import { NextRequest, NextResponse } from 'next/server'
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

    const leadSources = await prisma.crm_lead_source.findMany({
      where: { tenantId: ctx.tenantId },
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ leadSources })
  } catch (err) {
    console.error('[GET /api/crm/lead-sources]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSession()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await req.json() as { name: string }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 422 })

    const ls = await prisma.crm_lead_source.create({
      data: { tenantId: ctx.tenantId, name: name.trim() },
    })
    return NextResponse.json(ls, { status: 201 })
  } catch (err) {
    console.error('[POST /api/crm/lead-sources]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
