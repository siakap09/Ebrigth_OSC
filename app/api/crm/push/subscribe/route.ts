import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { z } from 'zod'

const Schema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
  tenantId: z.string(),
})

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = Schema.parse(await req.json())

  await prisma.crm_push_subscription.upsert({
    where: { userId_endpoint: { userId: session.user.id, endpoint: body.endpoint } },
    create: {
      userId: session.user.id,
      tenantId: body.tenantId,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
    },
    update: { p256dh: body.p256dh, auth: body.auth },
  })

  return NextResponse.json({ ok: true })
}
