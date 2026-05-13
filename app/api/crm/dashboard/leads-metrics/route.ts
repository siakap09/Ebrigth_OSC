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

/**
 * Branches whose lead activity is hidden from the elevated (super-admin)
 * dashboard view. Two categories:
 *   - Internal / admin branches whose leads aren't real sales pipeline
 *     (Ebright OD is the stress-test / training branch).
 *   - Upcoming branches that exist in CRM but haven't opened yet
 *     (Dataran Puchong Utama, Johor). Their leads are recorded but excluded
 *     from regional totals until they're operationally active.
 *
 * The branch manager for any of these still sees their own data normally:
 * when a super-admin uses topbar "view as branch" to inspect them, the
 * request goes through the non-elevated code path which respects the
 * explicit branchId and bypasses this exclusion.
 */
const ELEVATED_DASHBOARD_EXCLUDE = new Set<string>([
  '00 Ebright OD',
  '20 Ebright Public Speaking (Dataran Puchong Utama)',
])

/** Branch short-code lookup — matches the Data Studio labels.
 *  Keys are stored branch names using the GHL numbering scheme. */
const BRANCH_CODES: Record<string, string> = {
  '00 Ebright OD': 'OD',
  '01 Ebright Public Speaking (Online)': 'ONL',
  '02 Ebright Public Speaking (Subang Taipan)': 'ST',
  '03 Ebright Public Speaking (Setia Alam)': 'SA',
  '04 Ebright Public Speaking (Sri Petaling)': 'SP',
  '05 Ebright Kids Public Speaking (Kota Damansara)': 'KD',
  '06 Ebright Public Speaking (Putrajaya)': 'PJY',
  '07 Ebright Kids Public Speaking (Ampang)': 'AMP',
  '08 Ebright Public Speaking (Cyberjaya)': 'CJY',
  '09 Ebright Public Speaking (Klang)': 'KLG',
  '10 Ebright Kids Public Speaking (Denai Alam)': 'DA',
  '11 Ebright Public Speaking (Bandar Baru Bangi)': 'BBB',
  '12 Ebright Public Speaking (Danau Kota)': 'DK',
  '13 Ebright Public Speaking (Shah Alam)': 'SHA',
  '14 Ebright Public Speaking (Bandar Tun Hussein Onn)': 'BTHO',
  '15 Ebright Public Speaking (Eco Grandeur)': 'EGR',
  '16 Ebright Public Speaking (Bandar Seri Putra)': 'BSP',
  '17 Ebright Public Speaking Academy (Bandar Rimbayu)': 'RBY',
  '18 Ebright Public Speaking Academy (Taman Sri Gombak)': 'TSG',
  '19 Ebright Public Speaking Academy (Kota Warisan)': 'KW',
  '20 Ebright Public Speaking Academy (TTDI Grove, Kajang)': 'KTG',
}

// Regions preserved geographically — same branches per region as before, just
// using the new GHL names. Branch numbers in each region are no longer
// contiguous (the GHL list reorders things), but the geographic groupings
// match the existing Data Studio dashboard.
const REGIONS: Record<'A' | 'B' | 'C', string[]> = {
  A: [
    '17 Ebright Public Speaking Academy (Bandar Rimbayu)',
    '09 Ebright Public Speaking (Klang)',
    '13 Ebright Public Speaking (Shah Alam)',
    '03 Ebright Public Speaking (Setia Alam)',
    '10 Ebright Kids Public Speaking (Denai Alam)',
    '15 Ebright Public Speaking (Eco Grandeur)',
    '02 Ebright Public Speaking (Subang Taipan)',
  ],
  B: [
    '12 Ebright Public Speaking (Danau Kota)',
    '05 Ebright Kids Public Speaking (Kota Damansara)',
    '07 Ebright Kids Public Speaking (Ampang)',
    '04 Ebright Public Speaking (Sri Petaling)',
    '14 Ebright Public Speaking (Bandar Tun Hussein Onn)',
    '20 Ebright Public Speaking Academy (TTDI Grove, Kajang)',
    '18 Ebright Public Speaking Academy (Taman Sri Gombak)',
  ],
  C: [
    '06 Ebright Public Speaking (Putrajaya)',
    '19 Ebright Public Speaking Academy (Kota Warisan)',
    '11 Ebright Public Speaking (Bandar Baru Bangi)',
    '08 Ebright Public Speaking (Cyberjaya)',
    '16 Ebright Public Speaking (Bandar Seri Putra)',
    '01 Ebright Public Speaking (Online)',
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

    // (Previously this block built a per-pipeline ordering of stage
    // categories so cumulative-funnel counts could be derived. The
    // dashboard now uses snapshot counts — each opp counts in NL plus
    // exactly the category bucket of its current stage — so the ordering
    // table is no longer needed.)

    // Fetch branches. Elevated users get the full canonical list MINUS
    // the dashboard-excluded ones (OD etc.); non-elevated users only get
    // the branches they're explicitly linked to. Even if those branches
    // aren't in BRANCH_CODES, they show up in `main` (their stats) but
    // never in the regional cards.
    const elevatedBranchNames = Object.keys(BRANCH_CODES).filter(
      (n) => !ELEVATED_DASHBOARD_EXCLUDE.has(n),
    )
    const branchWhere = elevated
      ? { tenantId, name: { in: elevatedBranchNames } }
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

    // Counting model:
    //
    // NL  = every opportunity received in the date range, regardless of its
    //       current stage. This is the "leads received" total — it does NOT
    //       drop when a lead is dragged out of New Lead into Confirmed for
    //       Trial / Show Up / Enrolled. Once a lead enters the pipeline it
    //       is counted as NL for the date range it arrived in, permanently.
    //
    // CT / SU / ENR = snapshot counts — opportunities whose CURRENT stage
    //       matches that category. Dragging a card between stages on the
    //       kanban moves it from one bucket to another (the source
    //       decrements, the destination increments). Intermediate stages
    //       like "Contacted" / "Trial Booked" don't match any pattern in
    //       STAGE_PATTERN so they're only counted in NL.
    //
    // Rate denominators still use NL (received total) so they read as
    // "% of received leads that are currently at this stage".
    for (const o of opps) {
      const m = branchMetrics.get(o.branchId)
      if (!m) continue

      const info = stageInfo.get(o.stageId)
      if (!info) continue

      // NL: every opp received in the date range (constant under drag)
      m.NL += 1

      // CT / SU / ENR: only the opp's CURRENT stage category increments
      if (info.category === 'CT')  m.CT  += 1
      if (info.category === 'SU')  m.SU  += 1
      if (info.category === 'ENR') m.ENR += 1
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

      // Same counting model as the main block above: NL counts every opp
      // received that month (constant under drag); CT / SU / ENR are
      // snapshots of the opp's CURRENT stage category.
      for (const o of trendOpps) {
        const key = monthKey(new Date(o.createdAt))
        const bucket = monthMap.get(key)
        if (!bucket) continue
        const info = stageInfo.get(o.stageId)
        if (!info) continue

        bucket.NL += 1
        if (info.category === 'CT')  bucket.CT  += 1
        if (info.category === 'SU')  bucket.SU  += 1
        if (info.category === 'ENR') bucket.ENR += 1
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
