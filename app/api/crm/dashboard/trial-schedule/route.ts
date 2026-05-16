/**
 * Trial-class schedule grid for the branch-scoped Leads Dashboard.
 *
 * Query crm_appointment rows with title='Trial Class' that fall in the
 * window, bucket each one by (day-of-week × HH:MM slot label), and return
 * counts + the student list for each bucket so the UI can render the GHL-
 * style grid AND the click-through "who's joining" modal from a single
 * fetch.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import {
  TRIAL_DAY_ORDER,
  TRIAL_ALL_SLOTS,
  formatSlotLabel,
} from '@/lib/crm/trial-config'

const KL_OFFSET_MS = 8 * 3600 * 1000

function startOfDayKL(d: Date = new Date()): Date {
  const wall = new Date(d.getTime() + KL_OFFSET_MS)
  const mid = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  return new Date(mid - KL_OFFSET_MS)
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const access = await resolveBranchAccess(session.user.id)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  // Branch resolution mirrors the leads-metrics endpoint:
  //   - explicit ?branchId wins (admin viewing-as-branch)
  //   - else non-elevated users see their own branch(es)
  //   - else (elevated, no override) returns empty grid — the trial widget is
  //     a branch-level tool, not a tenant-wide rollup.
  const requestedBranchId = sp.get('branchId')
  const branchIds: string[] | null =
    requestedBranchId
      ? [requestedBranchId]
      : access.elevated
        ? null              // No branch chosen → no data
        : access.branchIds

  if (!branchIds || branchIds.length === 0) {
    return NextResponse.json({
      range: { from: null, to: null },
      branchIds: [],
      days: TRIAL_DAY_ORDER.map((d) => ({
        key: d.key,
        label: d.label,
        slots: TRIAL_ALL_SLOTS.map((slot) => ({ slot, count: 0, students: [] })),
      })),
    })
  }

  // Time window — driven by ?preset. All boundaries are KL wall-clock days.
  //   today / yesterday          → 24h window
  //   last_week / next_week      → rolling 7 days backwards or forwards from today
  //   this_month                 → calendar month containing today
  //   default ("next_7d")        → next 7 days starting today (back-compat)
  const preset = (sp.get('preset') ?? 'next_7d').toLowerCase()
  const today = startOfDayKL()
  let from: Date
  let to:   Date
  switch (preset) {
    case 'today':
      from = today
      to   = new Date(today.getTime() + 24 * 3600 * 1000 - 1)
      break
    case 'yesterday':
      from = new Date(today.getTime() - 24 * 3600 * 1000)
      to   = new Date(today.getTime() - 1)
      break
    case 'last_week':
      from = new Date(today.getTime() - 7 * 24 * 3600 * 1000)
      to   = new Date(today.getTime() - 1)
      break
    case 'this_month': {
      const wall = new Date(today.getTime() + KL_OFFSET_MS)
      const monthStartUtc = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1)
      const nextMonthStartUtc = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 1)
      from = new Date(monthStartUtc - KL_OFFSET_MS)
      to   = new Date(nextMonthStartUtc - KL_OFFSET_MS - 1)
      break
    }
    case 'next_week':
    case 'next_7d':
    default:
      from = today
      to   = new Date(today.getTime() + 7 * 24 * 3600 * 1000 - 1)
      break
  }

  const appointments = await prisma.crm_appointment.findMany({
    where: {
      tenantId: access.tenantId,
      title: 'Trial Class',
      branchId: { in: branchIds },
      startAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      startAt: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          childAge1: true,
          opportunities: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
    orderBy: { startAt: 'asc' },
  })

  interface Student {
    appointmentId: string
    contactId: string
    opportunityId: string | null
    name: string
    childAge: string | null
    startAt: string
  }

  // Pre-build empty grid so cells with zero attendees still render in the
  // canonical order — the dashboard doesn't need to deal with sparse keys.
  const grid: Record<string, Record<string, Student[]>> = {}
  for (const d of TRIAL_DAY_ORDER) {
    grid[d.key] = {}
    for (const slot of TRIAL_ALL_SLOTS) grid[d.key][slot] = []
  }

  for (const a of appointments) {
    const wall = new Date(a.startAt.getTime() + KL_OFFSET_MS)
    const dow = wall.getUTCDay()
    const dayMeta = TRIAL_DAY_ORDER.find((d) => d.dayIndex === dow)
    if (!dayMeta) continue
    // Use the KL wall-clock fields when formatting so the slot label always
    // matches what was originally picked by the BM, regardless of the
    // server's local timezone.
    const slotLabel = formatSlotLabel(new Date(Date.UTC(
      wall.getUTCFullYear(),
      wall.getUTCMonth(),
      wall.getUTCDate(),
      wall.getUTCHours(),
      wall.getUTCMinutes(),
    )))
    const bucket = grid[dayMeta.key]?.[slotLabel]
    if (!bucket) continue
    const name = `${a.contact.firstName}${a.contact.lastName ? ' ' + a.contact.lastName : ''}`.trim()
    bucket.push({
      appointmentId:  a.id,
      contactId:      a.contact.id,
      opportunityId:  a.contact.opportunities[0]?.id ?? null,
      name:           name || '(No name)',
      childAge:       a.contact.childAge1,
      startAt:        a.startAt.toISOString(),
    })
  }

  return NextResponse.json({
    range:     { from: from.toISOString(), to: to.toISOString() },
    branchIds,
    days: TRIAL_DAY_ORDER.map((d) => ({
      key: d.key,
      label: d.label,
      slots: TRIAL_ALL_SLOTS.map((slot) => ({
        slot,
        count: grid[d.key][slot].length,
        students: grid[d.key][slot],
      })),
    })),
  })
}
