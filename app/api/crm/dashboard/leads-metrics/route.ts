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
 * dashboard view. Currently only Ebright OD (internal stress-test /
 * training branch) — its leads shouldn't pollute headline numbers,
 * regional totals, or the "Main" pipeline.
 *
 * The OD branch manager still sees their own data normally: when a
 * super-admin uses topbar "view as branch" to inspect OD, the request
 * goes through the non-elevated code path which respects the explicit
 * branchId and bypasses this exclusion.
 */
const ELEVATED_DASHBOARD_EXCLUDE = new Set<string>([
  '00 Ebright (OD)',
])

/** Branch short-code lookup — matches the Data Studio labels.
 *  Keys are stored branch names using the standardized "NN Ebright (location)"
 *  scheme — branches were renamed away from the old "Public Speaking /
 *  Kids / Academy" suffix variants. */
const BRANCH_CODES: Record<string, string> = {
  '00 Ebright (OD)':                       'OD',
  '01 Ebright (Online)':                   'ONL',
  '02 Ebright (Subang Taipan)':            'ST',
  '03 Ebright (Setia Alam)':               'SA',
  '04 Ebright (Sri Petaling)':             'SP',
  '05 Ebright (Kota Damansara)':           'KD',
  '06 Ebright (Putrajaya)':                'PJY',
  '07 Ebright (Ampang)':                   'AMP',
  '08 Ebright (Cyberjaya)':                'CJY',
  '09 Ebright (Klang)':                    'KLG',
  '10 Ebright (Denai Alam)':               'DA',
  '11 Ebright (Bandar Baru Bangi)':        'BBB',
  '12 Ebright (Danau Kota)':               'DK',
  '13 Ebright (Shah Alam)':                'SHA',
  '14 Ebright (Bandar Tun Hussein Onn)':   'BTHO',
  '15 Ebright (Eco Grandeur)':             'EGR',
  '16 Ebright (Bandar Seri Putra)':        'BSP',
  '17 Ebright (Bandar Rimbayu)':           'RBY',
  '18 Ebright (Taman Sri Gombak)':         'TSG',
  '19 Ebright (Kota Warisan)':             'KW',
  '20 Ebright (Kajang TTDI Grove)':        'KTG',
  '21 Ebright (Dataran Puchong Utama)':    'DPU',
  '22 Ebright (Puncak Jalil)':             'PJL',
  '23 Ebright (Tropicana Sungai Buloh)':   'TSB',
}

// Regions preserved geographically — same branches per region as before, just
// using the new GHL names. Branch numbers in each region are no longer
// contiguous (the GHL list reorders things), but the geographic groupings
// match the existing Data Studio dashboard.
const REGIONS: Record<'A' | 'B' | 'C', string[]> = {
  A: [
    '17 Ebright (Bandar Rimbayu)',
    '09 Ebright (Klang)',
    '13 Ebright (Shah Alam)',
    '03 Ebright (Setia Alam)',
    '10 Ebright (Denai Alam)',
    '15 Ebright (Eco Grandeur)',
    '02 Ebright (Subang Taipan)',
    '23 Ebright (Tropicana Sungai Buloh)',
  ],
  B: [
    '12 Ebright (Danau Kota)',
    '05 Ebright (Kota Damansara)',
    '07 Ebright (Ampang)',
    '04 Ebright (Sri Petaling)',
    '14 Ebright (Bandar Tun Hussein Onn)',
    '20 Ebright (Kajang TTDI Grove)',
    '18 Ebright (Taman Sri Gombak)',
    '21 Ebright (Dataran Puchong Utama)',
  ],
  C: [
    '06 Ebright (Putrajaya)',
    '19 Ebright (Kota Warisan)',
    '11 Ebright (Bandar Baru Bangi)',
    '08 Ebright (Cyberjaya)',
    '16 Ebright (Bandar Seri Putra)',
    '01 Ebright (Online)',
    '22 Ebright (Puncak Jalil)',
  ],
}

// Stage-name detection. BUF matches both legacy "Self-Generated" and the new
// "Buffer (OD use only)" label so the snapshot count survives the rename.
const STAGE_PATTERN = {
  NL:  /^new lead$/i,
  CT:  /^confirmed for trial$/i,
  SU:  /^show[- ]up$/i,
  ENR: /^enrolled$/i,
  BUF: /^(self[- ]generated|buffer)/i,
}

interface BranchMetrics {
  branchId: string
  branchName: string
  code: string
  /** A / B / C from REGIONS, or null for branches outside the canonical list. */
  region: 'A' | 'B' | 'C' | null
  NL: number
  CT: number
  SU: number
  ENR: number
  /** Snapshot — leads currently parked in the Buffer (OD use only) stage. */
  BUF: number
  conversionRate: number   // ENR / NL
  confirmedRate: number    // CT / NL
  showUpRate: number       // SU / CT
  enrolmentRate: number    // ENR / SU
}

function zero(): Omit<BranchMetrics, 'branchId' | 'branchName' | 'code' | 'region'> {
  return {
    NL: 0, CT: 0, SU: 0, ENR: 0, BUF: 0,
    conversionRate: 0, confirmedRate: 0, showUpRate: 0, enrolmentRate: 0,
  }
}

/** Resolve a branch name → region code using the REGIONS map at module scope. */
function regionFor(branchName: string): 'A' | 'B' | 'C' | null {
  if (REGIONS.A.includes(branchName)) return 'A'
  if (REGIONS.B.includes(branchName)) return 'B'
  if (REGIONS.C.includes(branchName)) return 'C'
  return null
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
  // Default is now `this_week` (per the dashboard redesign — BMs land on the
  // running week view instead of "today only", which is rarely meaningful
  // for funnel rates with single-digit denominators).
  const preset = sp.get('preset') ?? 'this_week'
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
    case 'today': {
      return { from: today, to: endOfToday }
    }
    case 'last_week': {
      // Previous calendar week Mon-Sun in KL day-of-week terms.
      const wall = new Date(today.getTime() + KL_OFFSET_MS)
      const dow = wall.getUTCDay() // 0=Sun, 1=Mon, …
      const daysSinceMon = dow === 0 ? 6 : dow - 1  // 0 when today is Mon
      const fromMs = today.getTime() - (daysSinceMon + 7) * 24 * 3600 * 1000
      const toMs   = today.getTime() - daysSinceMon * 24 * 3600 * 1000 - 1
      return { from: new Date(fromMs), to: new Date(toMs) }
    }
    case '30d': {
      const from = new Date(today.getTime() - 29 * 24 * 3600 * 1000)
      return { from, to: endOfToday }
    }
    case 'this_week':
    default: {
      // Monday start in KL day-of-week terms (KL has no DST). Default branch.
      const wall = new Date(today.getTime() + KL_OFFSET_MS)
      const dow = wall.getUTCDay() // 0=Sun
      const daysBack = dow === 0 ? 6 : dow - 1
      const from = new Date(today.getTime() - daysBack * 24 * 3600 * 1000)
      return { from, to: endOfToday }
    }
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
      select: { id: true, name: true, shortCode: true, order: true, pipelineId: true },
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
      // Buffer is identified by short-code first so the rename to
      // "Buffer (OD use only)" / "Self-Generated" both resolve consistently.
      if (s.shortCode === 'SG') {
        cat = 'BUF'
      } else {
        for (const [k, re] of Object.entries(STAGE_PATTERN) as Array<[keyof typeof STAGE_PATTERN, RegExp]>) {
          if (re.test(s.name)) { cat = k; break }
        }
      }
      stageInfo.set(s.id, { pipelineId: s.pipelineId, order: s.order, category: cat })
    }

    // (The previous build also computed per-pipeline category orderings to
    // run a "current stage.order ≥ CT.order" cumulative check. That logic
    // is gone — CT/SU/ENR now come from crm_stage_history directly.)

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

    // Count opportunities per (branchId, category) in the date range.
    //
    // NL  — leads CREATED in range (snapshot of inflow).
    // BUF — current-stage snapshot at end of range (parked in Buffer).
    // CT / SU / ENR — counted by stage_history ENTRY date. A lead dragged
    //   into the stage at any time inside the range counts +1 there. Once
    //   recorded the count is permanent: subsequent moves don't undo it.
    //
    // This replaces the older trial-appointment-driven CT/SU counts. The
    // old model bucketed CT/SU by the trial's scheduled date, so a lead
    // dragged to CT today with a class booked next week wouldn't show up
    // in this week's CT count; and a Show-Up that later moved to CL would
    // silently disappear from the historical SU figure once "current
    // stage < SU.order" became true.
    const opps = await prisma.crm_opportunity.findMany({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { gte: from, lte: to },
        branchId: { in: branches.map((b) => b.id) },
      },
      select: { id: true, branchId: true, stageId: true, createdAt: true, contactId: true },
    })

    // ─── Stage-history entries that drive CT / SU / ENR ──────────────────
    // Pre-collect the stage IDs that map to each target category. A pipeline
    // can only have one stage per category (CT/SU/ENR), but tenants have
    // multiple pipelines, so this is a many-to-one map.
    const stageIdsByCategory: Record<'CT' | 'SU' | 'ENR', string[]> = { CT: [], SU: [], ENR: [] }
    for (const [id, info] of stageInfo.entries()) {
      if (info.category === 'CT')  stageIdsByCategory.CT.push(id)
      if (info.category === 'SU')  stageIdsByCategory.SU.push(id)
      if (info.category === 'ENR') stageIdsByCategory.ENR.push(id)
    }
    const targetStageIds = [
      ...stageIdsByCategory.CT,
      ...stageIdsByCategory.SU,
      ...stageIdsByCategory.ENR,
    ]

    const stageEntries =
      targetStageIds.length === 0
        ? []
        : await prisma.crm_stage_history.findMany({
            where: {
              tenantId,
              changedAt: { gte: from, lte: to },
              toStageId: { in: targetStageIds },
              opportunity: { branchId: { in: branches.map((b) => b.id) } },
            },
            select: {
              opportunityId: true,
              toStageId: true,
              opportunity: { select: { branchId: true } },
            },
          })

    // Initialise per-branch metrics
    const branchMetrics = new Map<string, BranchMetrics>()
    for (const b of branches) {
      branchMetrics.set(b.id, {
        branchId: b.id,
        branchName: b.name,
        code: BRANCH_CODES[b.name] ?? '',
        region: regionFor(b.name),
        ...zero(),
      })
    }

    // NL + BUF — driven by the opportunity rows in `opps` (createdAt-in-range).
    // CT / SU / ENR — driven by stage_history below.
    for (const o of opps) {
      const m = branchMetrics.get(o.branchId)
      if (!m) continue
      const info = stageInfo.get(o.stageId)
      if (!info) continue

      m.NL += 1

      // Buffer is a snapshot of the current parked-leads count among range-
      // received opportunities. Doesn't roll into the funnel.
      if (info.category === 'BUF') {
        m.BUF += 1
      }
    }

    // CT / SU / ENR — each opportunity is counted once per category per
    // range, regardless of how many transitions it makes back and forth.
    // We dedupe via Set keyed by `${branchId}|${oppId}` per category so a
    // CT → RSD → CT round-trip in the same day doesn't double-count.
    const seenByBranchCat: Record<'CT' | 'SU' | 'ENR', Map<string, Set<string>>> = {
      CT:  new Map(),
      SU:  new Map(),
      ENR: new Map(),
    }
    for (const h of stageEntries) {
      const branchId = h.opportunity?.branchId
      if (!branchId) continue
      const info = stageInfo.get(h.toStageId)
      const cat = info?.category
      if (cat !== 'CT' && cat !== 'SU' && cat !== 'ENR') continue
      let perBranch = seenByBranchCat[cat].get(branchId)
      if (!perBranch) { perBranch = new Set(); seenByBranchCat[cat].set(branchId, perBranch) }
      perBranch.add(h.opportunityId)
    }
    for (const [branchId, ids] of seenByBranchCat.CT.entries()) {
      const m = branchMetrics.get(branchId); if (m) m.CT = ids.size
    }
    for (const [branchId, ids] of seenByBranchCat.SU.entries()) {
      const m = branchMetrics.get(branchId); if (m) m.SU = ids.size
    }
    for (const [branchId, ids] of seenByBranchCat.ENR.entries()) {
      const m = branchMetrics.get(branchId); if (m) m.ENR = ids.size
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
      const BUF = list.reduce((s, x) => s + x.BUF, 0)
      return {
        branchId: '',
        branchName: '',
        code: '',
        region: null,
        NL, CT, SU, ENR, BUF,
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
      region: null,
      NL:  regionA.NL + regionB.NL + regionC.NL,
      CT:  regionA.CT + regionB.CT + regionC.CT,
      SU:  regionA.SU + regionB.SU + regionC.SU,
      ENR: regionA.ENR + regionB.ENR + regionC.ENR,
      BUF: regionA.BUF + regionB.BUF + regionC.BUF,
      conversionRate: 0, confirmedRate: 0, showUpRate: 0, enrolmentRate: 0,
    }
    Object.assign(main, computeRates(main))

    // Sort branches numerically by the "NN …" name prefix so the dashboard
    // table and bar chart read 01 → 02 → 03 instead of jumping around by
    // region order. Region colouring still works via the per-branch
    // `region` field set during initialisation.
    const orderedBranches = Array.from(branchMetrics.values()).sort((a, b) =>
      a.branchName.localeCompare(b.branchName, undefined, { numeric: true }),
    )

    // ── Monthly trend (only for branch-scoped views) ─────────────────────────
    // 6-month rolling window ending on `to`. Same counting model as the
    // headline block — NL by createdAt, CT/SU/ENR by stage_history entry
    // date — but bucketed by KL month instead of summed for one range.
    let byMonth: Array<{ month: string; NL: number; CT: number; SU: number; ENR: number; BUF: number }> = []
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

      const trendOpps = await prisma.crm_opportunity.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: sixMonthsBack, lte: to },
          branchId: { in: branches.map((b) => b.id) },
        },
        select: { branchId: true, stageId: true, createdAt: true },
      })

      // Stage-history entries (CT / SU / ENR) over the same 6-month window.
      const trendEntries =
        targetStageIds.length === 0
          ? []
          : await prisma.crm_stage_history.findMany({
              where: {
                tenantId,
                changedAt: { gte: sixMonthsBack, lte: to },
                toStageId: { in: targetStageIds },
                opportunity: { branchId: { in: branches.map((b) => b.id) } },
              },
              select: {
                opportunityId: true,
                toStageId: true,
                changedAt: true,
                opportunity: { select: { branchId: true } },
              },
            })

      const monthMap = new Map<string, { NL: number; CT: number; SU: number; ENR: number; BUF: number }>()
      // Pre-seed every month so the chart shows zeros instead of gaps.
      const startYear = wall.getUTCFullYear()
      const startMonth = wall.getUTCMonth() - 5
      for (let m = 0; m < 6; m++) {
        const yyyy = startYear + Math.floor((startMonth + m) / 12)
        const mm = ((startMonth + m) % 12 + 12) % 12
        monthMap.set(`${yyyy}-${String(mm + 1).padStart(2, '0')}`, { NL: 0, CT: 0, SU: 0, ENR: 0, BUF: 0 })
      }

      // NL + BUF — bucket by createdAt month.
      for (const o of trendOpps) {
        const key = monthKey(new Date(o.createdAt))
        const bucket = monthMap.get(key)
        if (!bucket) continue
        const info = stageInfo.get(o.stageId)
        if (!info) continue
        bucket.NL += 1
        if (info.category === 'BUF') bucket.BUF += 1
      }

      // CT / SU / ENR — bucket by stage_history.changedAt month, dedup per
      // (month, category, opportunityId) so a lead bouncing CT → RSD → CT
      // inside one month doesn't count twice.
      const seenInMonth: Record<'CT' | 'SU' | 'ENR', Map<string, Set<string>>> = {
        CT: new Map(), SU: new Map(), ENR: new Map(),
      }
      for (const h of trendEntries) {
        const cat = stageInfo.get(h.toStageId)?.category
        if (cat !== 'CT' && cat !== 'SU' && cat !== 'ENR') continue
        const key = monthKey(new Date(h.changedAt))
        if (!monthMap.has(key)) continue
        let set = seenInMonth[cat].get(key)
        if (!set) { set = new Set(); seenInMonth[cat].set(key, set) }
        set.add(h.opportunityId)
      }
      for (const cat of ['CT', 'SU', 'ENR'] as const) {
        for (const [monthKey_, ids] of seenInMonth[cat].entries()) {
          const bucket = monthMap.get(monthKey_)
          if (!bucket) continue
          bucket[cat] = ids.size
        }
      }

      byMonth = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v }))
    }

    // Empty zero block — used in place of regional cards / branch lists for
    // non-elevated users so the response shape stays the same but the UI
    // can detect "nothing to render here" cheaply.
    const empty: BranchMetrics = {
      branchId: '', branchName: '', code: '', region: null,
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
      // Surfaced so widgets that branch on "super admin vs agency admin"
      // (e.g. read-only trial schedule view) don't need an extra round-trip.
      isSuperAdmin: access?.isSuperAdmin ?? false,
      byMonth,
      // Surface what branch the response is scoped to so the UI can label
      // the "Your branch" block ("Viewing as Rimbayu" etc.).
      scopedBranchName: elevated ? null : (branches[0]?.name ?? null),
      // Also surface the ID so non-elevated callers can fetch dependent
      // widgets (like the trial-schedule grid) without needing the topbar
      // branch-switcher to have an explicit selection. BMs whose access
      // covers a single branch don't get a switcher, so without this they
      // can't drive a per-branch widget at all.
      scopedBranchId: elevated ? null : (branches[0]?.id ?? null),
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
