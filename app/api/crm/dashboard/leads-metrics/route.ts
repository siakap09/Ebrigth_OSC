/**
 * Data-Studio-style lead metrics.
 *
 * Returns per-branch + per-region counts of opportunities currently in key
 * stages (NL, CT, SU, ENR) plus funnel conversion rates, all filtered by a
 * date range based on crm_opportunity.createdAt.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { isPreviewMode } from '@/lib/crm/preview-mode'
import { clampToDisplayMin } from '@/lib/crm/display-cutoff'
import { resolveBranchAccess } from '@/lib/crm/branch-access'

async function resolveTenantId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    if (!isPreviewMode()) return null
  }
  // Try crm_user_branch first
  if (session?.user?.id) {
    const ub = await prisma.crm_user_branch.findFirst({
      where: { userId: session.user.id },
      select: { tenantId: true },
    })
    if (ub) return ub.tenantId
  }
  // Fallback for preview / users without a branch link — try known slugs first,
  // then fall through to the first tenant in the DB. This avoids a 401 just
  // because the production-seed slug doesn't match what was actually seeded.
  const bySlug = await prisma.crm_tenant.findFirst({
    where: { slug: { in: ['ebright', 'ebright-demo'] } },
    select: { id: true },
  })
  if (bySlug) return bySlug.id

  const first = await prisma.crm_tenant.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  return first?.id ?? null
}

/** Branch short-code lookup — matches the Data Studio labels */
// Keys are stored branch names (prefixed after rename migration).
const BRANCH_CODES: Record<string, string> = {
  '00 Ebright OD': 'OD',
  '01 Ebright Public Speaking (Rimbayu)': 'RBY',
  '02 Ebright Public Speaking (Klang)': 'KLG',
  '03 Ebright Public Speaking (Shah Alam)': 'SHA',
  '04 Ebright Public Speaking (Setia Alam)': 'SA',
  '05 Ebright Public Speaking (Denai Alam)': 'DA',
  '06 Ebright Public Speaking (Eco Grandeur)': 'EGR',
  '07 Ebright Public Speaking (Subang Taipan)': 'ST',
  '08 Ebright Public Speaking (Danau Kota)': 'DK',
  '09 Ebright Public Speaking (Kota Damansara)': 'KD',
  '10 Ebright Public Speaking (Ampang)': 'AMP',
  '11 Ebright Public Speaking (Sri Petaling)': 'SP',
  '12 Ebright Public Speaking (Bandar Tun Hussein Onn)': 'BTHO',
  '13 Ebright Public Speaking (Kajang TTDI Grove)': 'KTG',
  '14 Ebright Public Speaking (Taman Sri Gombak)': 'TSG',
  '15 Ebright Public Speaking (Putrajaya)': 'PJY',
  '16 Ebright Public Speaking (Kota Warisan)': 'KW',
  '17 Ebright Public Speaking (Bandar Baru Bangi)': 'BBB',
  '18 Ebright Public Speaking (Cyberjaya)': 'CJY',
  '19 Ebright Public Speaking (Bandar Seri Putra)': 'BSP',
  '20 Ebright Public Speaking (Dataran Puchong Utama)': 'DPU',
  '21 Ebright Public Speaking (Online)': 'ONL',
}

const REGIONS: Record<'A' | 'B' | 'C', string[]> = {
  A: [
    '01 Ebright Public Speaking (Rimbayu)',
    '02 Ebright Public Speaking (Klang)',
    '03 Ebright Public Speaking (Shah Alam)',
    '04 Ebright Public Speaking (Setia Alam)',
    '05 Ebright Public Speaking (Denai Alam)',
    '06 Ebright Public Speaking (Eco Grandeur)',
    '07 Ebright Public Speaking (Subang Taipan)',
  ],
  B: [
    '08 Ebright Public Speaking (Danau Kota)',
    '09 Ebright Public Speaking (Kota Damansara)',
    '10 Ebright Public Speaking (Ampang)',
    '11 Ebright Public Speaking (Sri Petaling)',
    '12 Ebright Public Speaking (Bandar Tun Hussein Onn)',
    '13 Ebright Public Speaking (Kajang TTDI Grove)',
    '14 Ebright Public Speaking (Taman Sri Gombak)',
  ],
  C: [
    '15 Ebright Public Speaking (Putrajaya)',
    '16 Ebright Public Speaking (Kota Warisan)',
    '17 Ebright Public Speaking (Bandar Baru Bangi)',
    '18 Ebright Public Speaking (Cyberjaya)',
    '19 Ebright Public Speaking (Bandar Seri Putra)',
    '20 Ebright Public Speaking (Dataran Puchong Utama)',
    '21 Ebright Public Speaking (Online)',
  ],
}

// Stage-name detection
const STAGE_PATTERN = {
  NL:  /^new lead$/i,
  CT:  /^confirmed for trial$/i,
  SU:  /^show[- ]up$/i,
  ENR: /^enrolled$/i,
}

interface BranchMetrics {
  branchId: string
  branchName: string
  code: string
  NL: number
  CT: number
  SU: number
  ENR: number
  conversionRate: number   // ENR / NL
  confirmedRate: number    // CT / NL
  showUpRate: number       // SU / CT
  enrolmentRate: number    // ENR / SU
}

function zero(): Omit<BranchMetrics, 'branchId' | 'branchName' | 'code'> {
  return {
    NL: 0, CT: 0, SU: 0, ENR: 0,
    conversionRate: 0, confirmedRate: 0, showUpRate: 0, enrolmentRate: 0,
  }
}

function computeRates(m: Pick<BranchMetrics, 'NL' | 'CT' | 'SU' | 'ENR'>) {
  return {
    conversionRate: m.NL ? m.ENR / m.NL : 0,
    confirmedRate:  m.NL ? m.CT / m.NL  : 0,
    showUpRate:     m.CT ? m.SU / m.CT  : 0,
    enrolmentRate:  m.SU ? m.ENR / m.SU : 0,
  }
}

// All dashboard ranges are computed against Asia/Kuala_Lumpur wall-clock
// terms — that's the timezone the business operates in, and the timezone
// the cron-fed master_leads_base.submission_date is written in. Without
// this, a Next.js container running in UTC would treat "today" as 00:00
// UTC → 07:59 KL the next morning, classifying every lead submitted
// between midnight and 8 AM KL as "yesterday". KL has no DST so a fixed
// +8h offset is safe and saves us pulling in date-fns-tz.
const KL_OFFSET_MS = 8 * 3600 * 1000

/** UTC instant at midnight Asia/Kuala_Lumpur for the KL day that contains `now`. */
function startOfDayKL(now: Date = new Date()): Date {
  const wall = new Date(now.getTime() + KL_OFFSET_MS) // shift so UTC fields == KL wall-clock
  const midnightKL = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  return new Date(midnightKL - KL_OFFSET_MS)
}

function parseDateRange(sp: URLSearchParams): { from: Date; to: Date } {
  const preset = sp.get('preset') ?? 'today'
  const today = startOfDayKL()
  const endOfToday = new Date(today.getTime() + 24 * 3600 * 1000 - 1)

  if (preset === 'custom') {
    const fromStr = sp.get('from') ?? today.toISOString()
    const toStr = sp.get('to') ?? endOfToday.toISOString()
    return { from: new Date(fromStr), to: new Date(toStr) }
  }

  switch (preset) {
    case 'yesterday': {
      const from = new Date(today.getTime() - 24 * 3600 * 1000)
      const to = new Date(today.getTime() - 1)
      return { from, to }
    }
    case '7d': {
      const from = new Date(today.getTime() - 6 * 24 * 3600 * 1000)
      return { from, to: endOfToday }
    }
    case 'this_week': {
      // Monday start in KL day-of-week terms (KL has no DST).
      const wall = new Date(today.getTime() + KL_OFFSET_MS)
      const dow = wall.getUTCDay() // 0=Sun
      const daysBack = dow === 0 ? 6 : dow - 1
      const from = new Date(today.getTime() - daysBack * 24 * 3600 * 1000)
      return { from, to: endOfToday }
    }
    case '30d': {
      const from = new Date(today.getTime() - 29 * 24 * 3600 * 1000)
      return { from, to: endOfToday }
    }
    default: // today
      return { from: today, to: endOfToday }
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await resolveTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve the caller's role + branch scope. Non-elevated users only ever
    // see their own branch metrics in `main`; the regions + branches arrays
    // come back empty so the UI hides those sections entirely.
    const session = await auth.api.getSession({ headers: await headers() })
    const access = session?.user?.id ? await resolveBranchAccess(session.user.id) : null
    const isElevatedUser = access?.elevated ?? true   // API key callers treated as elevated

    // Admin "view as branch": when an elevated user picks a specific branch
    // in the topbar dropdown, the UI sends `?branchId=<id>` and we treat the
    // request the same as if a branch manager for that branch were calling.
    // This lets super admins inspect a branch without logging out.
    const requestedBranchId = req.nextUrl.searchParams.get('branchId')
    const viewAsBranch = isElevatedUser && requestedBranchId ? requestedBranchId : null

    const elevated = isElevatedUser && !viewAsBranch
    const allowedBranchIds = elevated
      ? null
      : viewAsBranch
        ? [viewAsBranch]
        : (access?.branchIds ?? [])

    const range = parseDateRange(req.nextUrl.searchParams)
    // Clamp the lower bound to the global display floor so this endpoint
    // stays consistent with the kanban + dashboard.
    const from = clampToDisplayMin(range.from)
    const to = range.to

    // Grab all stages — need id → category AND per-pipeline order of each category
    const stages = await prisma.crm_stage.findMany({
      where: { tenantId },
      select: { id: true, name: true, order: true, pipelineId: true },
    })

    // Map stage.id → { pipelineId, order, category }
    interface StageInfo {
      pipelineId: string
      order: number
      category?: keyof typeof STAGE_PATTERN
    }
    const stageInfo = new Map<string, StageInfo>()
    for (const s of stages) {
      let cat: keyof typeof STAGE_PATTERN | undefined
      for (const [k, re] of Object.entries(STAGE_PATTERN) as Array<[keyof typeof STAGE_PATTERN, RegExp]>) {
        if (re.test(s.name)) { cat = k; break }
      }
      stageInfo.set(s.id, { pipelineId: s.pipelineId, order: s.order, category: cat })
    }

    // Per-pipeline category order (e.g., NL=0, CT=5, SU=7, ENR=9 for lead pipelines)
    const categoryOrderByPipeline = new Map<
      string,
      { NL?: number; CT?: number; SU?: number; ENR?: number }
    >()
    for (const s of stages) {
      if (!s.pipelineId) continue
      const info = stageInfo.get(s.id)
      if (!info?.category) continue
      const bucket = categoryOrderByPipeline.get(s.pipelineId) ?? {}
      bucket[info.category] = s.order
      categoryOrderByPipeline.set(s.pipelineId, bucket)
    }

    // Fetch branches. Elevated users get the full canonical list; non-elevated
    // users only get the branches they're explicitly linked to. Even if those
    // branches aren't in BRANCH_CODES, they show up in `main` (their stats)
    // but never in the regional cards.
    const branchWhere = elevated
      ? { tenantId, name: { in: Object.keys(BRANCH_CODES) } }
      : { tenantId, id: { in: allowedBranchIds ?? [] } }
    const branches = await prisma.crm_branch.findMany({
      where: branchWhere,
      select: { id: true, name: true },
    })

    // Count opportunities per (branchId, category) in the date range
    const opps = await prisma.crm_opportunity.findMany({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { gte: from, lte: to },
        branchId: { in: branches.map((b) => b.id) },
      },
      select: { id: true, branchId: true, stageId: true, createdAt: true },
    })

    // Initialise per-branch metrics
    const branchMetrics = new Map<string, BranchMetrics>()
    for (const b of branches) {
      branchMetrics.set(b.id, {
        branchId: b.id,
        branchName: b.name,
        code: BRANCH_CODES[b.name] ?? '',
        ...zero(),
      })
    }

    // Cumulative counting: an opp currently in stage with order >= N is counted
    // as having "reached" every category with order <= N.
    //
    // NL  = every opportunity (reached order 0 = entered the pipeline)
    // CT  = opps whose current stage.order >= CT stage.order
    // SU  = opps whose current stage.order >= SU stage.order
    // ENR = opps whose current stage.order >= ENR stage.order
    //
    // This makes the rates match what the user expects:
    //   Conversion   = ENR / NL   (end-to-end)
    //   Confirmed    = CT  / NL   (% reached CT)
    //   Show Up Rate = SU  / CT   (of those who confirmed, how many showed up)
    //   Enrolment    = ENR / SU   (of those who showed up, how many enrolled)
    for (const o of opps) {
      const m = branchMetrics.get(o.branchId)
      if (!m) continue

      const info = stageInfo.get(o.stageId)
      if (!info) continue

      const catOrders = categoryOrderByPipeline.get(info.pipelineId)
      if (!catOrders) continue

      // NL: every opp that entered the pipeline
      m.NL += 1

      if (catOrders.CT !== undefined && info.order >= catOrders.CT) m.CT += 1
      if (catOrders.SU !== undefined && info.order >= catOrders.SU) m.SU += 1
      if (catOrders.ENR !== undefined && info.order >= catOrders.ENR) m.ENR += 1
    }

    for (const m of branchMetrics.values()) {
      Object.assign(m, computeRates(m))
    }

    // Aggregate by region
    function aggregate(names: string[]): BranchMetrics {
      const list = branches
        .filter((b) => names.includes(b.name))
        .map((b) => branchMetrics.get(b.id))
        .filter((x): x is BranchMetrics => !!x)
      const NL  = list.reduce((s, x) => s + x.NL, 0)
      const CT  = list.reduce((s, x) => s + x.CT, 0)
      const SU  = list.reduce((s, x) => s + x.SU, 0)
      const ENR = list.reduce((s, x) => s + x.ENR, 0)
      return {
        branchId: '',
        branchName: '',
        code: '',
        NL, CT, SU, ENR,
        ...computeRates({ NL, CT, SU, ENR }),
      }
    }

    const regionA = aggregate(REGIONS.A)
    const regionB = aggregate(REGIONS.B)
    const regionC = aggregate(REGIONS.C)
    const main: BranchMetrics = {
      branchId: '',
      branchName: '',
      code: '',
      NL:  regionA.NL + regionB.NL + regionC.NL,
      CT:  regionA.CT + regionB.CT + regionC.CT,
      SU:  regionA.SU + regionB.SU + regionC.SU,
      ENR: regionA.ENR + regionB.ENR + regionC.ENR,
      conversionRate: 0, confirmedRate: 0, showUpRate: 0, enrolmentRate: 0,
    }
    Object.assign(main, computeRates(main))

    // Sort branches by region for the per-branch breakdown
    const orderedBranches = [...REGIONS.A, ...REGIONS.B, ...REGIONS.C]
      .map((name) => {
        const b = branches.find((x) => x.name === name)
        return b ? branchMetrics.get(b.id) : null
      })
      .filter((x): x is BranchMetrics => !!x)

    // ── Monthly trend (only for branch-scoped views) ─────────────────────────
    // Build a 6-month rolling window ending on `to` so the line chart has
    // enough span to be useful. Bucket each opp's createdAt by YYYY-MM and
    // re-apply the same cumulative-stage logic used for the main block.
    let byMonth: Array<{ month: string; NL: number; CT: number; SU: number; ENR: number }> = []
    if (!elevated) {
      // Bucket by KL month so a lead at 02:00 KL on the 1st doesn't fall
      // back into the previous UTC month. Same +8h shift trick as above.
      const monthKey = (d: Date) => {
        const wall = new Date(d.getTime() + KL_OFFSET_MS)
        return `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, '0')}`
      }
      const wall = new Date(to.getTime() + KL_OFFSET_MS)
      const sixMonthsBackWallMs = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 5, 1)
      const sixMonthsBack = new Date(sixMonthsBackWallMs - KL_OFFSET_MS)

      // Re-fetch for the wider window — `from`/`to` may be just "today".
      const trendOpps = await prisma.crm_opportunity.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: sixMonthsBack, lte: to },
          branchId: { in: branches.map((b) => b.id) },
        },
        select: { branchId: true, stageId: true, createdAt: true },
      })

      const monthMap = new Map<string, { NL: number; CT: number; SU: number; ENR: number }>()
      // Pre-seed every month so the chart shows zeros instead of gaps.
      // Iterate in wall-clock space (KL) so we don't drift across DST/UTC.
      const startYear = wall.getUTCFullYear()
      const startMonth = wall.getUTCMonth() - 5
      for (let m = 0; m < 6; m++) {
        const yyyy = startYear + Math.floor((startMonth + m) / 12)
        const mm = ((startMonth + m) % 12 + 12) % 12
        monthMap.set(`${yyyy}-${String(mm + 1).padStart(2, '0')}`, { NL: 0, CT: 0, SU: 0, ENR: 0 })
      }

      for (const o of trendOpps) {
        const key = monthKey(new Date(o.createdAt))
        const bucket = monthMap.get(key)
        if (!bucket) continue
        const info = stageInfo.get(o.stageId)
        if (!info) continue
        const catOrders = categoryOrderByPipeline.get(info.pipelineId)
        if (!catOrders) continue

        bucket.NL += 1
        if (catOrders.CT  !== undefined && info.order >= catOrders.CT)  bucket.CT  += 1
        if (catOrders.SU  !== undefined && info.order >= catOrders.SU)  bucket.SU  += 1
        if (catOrders.ENR !== undefined && info.order >= catOrders.ENR) bucket.ENR += 1
      }

      byMonth = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v }))
    }

    // Empty zero block — used in place of regional cards / branch lists for
    // non-elevated users so the response shape stays the same but the UI
    // can detect "nothing to render here" cheaply.
    const empty: BranchMetrics = {
      branchId: '', branchName: '', code: '',
      ...zero(),
    }

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      main,
      regions: elevated
        ? { A: regionA, B: regionB, C: regionC }
        : { A: empty, B: empty, C: empty },
      branches: elevated ? orderedBranches : [],
      regionMap: elevated
        ? {
            A: REGIONS.A.map((n) => BRANCH_CODES[n] ?? n),
            B: REGIONS.B.map((n) => BRANCH_CODES[n] ?? n),
            C: REGIONS.C.map((n) => BRANCH_CODES[n] ?? n),
          }
        : { A: [], B: [], C: [] },
      elevated,
      byMonth,
      // Surface what branch the response is scoped to so the UI can label
      // the "Your branch" block ("Viewing as Rimbayu" etc.).
      scopedBranchName: elevated ? null : (branches[0]?.name ?? null),
    })
  } catch (e) {
    console.error('[GET leads-metrics]', e)
    const message = e instanceof Error ? e.message : 'Internal error'
    // Surface the real cause in dev so the dashboard shows something actionable
    // instead of a blanket "Failed to load metrics".
    return NextResponse.json(
      {
        error: message,
        stack: process.env.NODE_ENV === 'development' && e instanceof Error ? e.stack : undefined,
      },
      { status: 500 },
    )
  }
}
