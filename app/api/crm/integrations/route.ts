import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'

async function getSessionAndBranch(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const userBranch = await prisma.crm_user_branch.findFirst({
    where: { userId: session.user.id },
    select: { tenantId: true, branchId: true },
  })
  if (!userBranch) return null
  return { session, ...userBranch }
}

// GET /api/crm/integrations — list all integrations for branch
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSessionAndBranch(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const integrations = await prisma.crm_integration.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
      select: { type: true, status: true, lastSyncAt: true },
    })

    return NextResponse.json({ integrations, branchId: ctx.branchId })
  } catch (err) {
    console.error('[GET /api/crm/integrations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
