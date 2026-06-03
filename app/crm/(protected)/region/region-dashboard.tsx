'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Map } from 'lucide-react'
import { cn } from '@/lib/crm/utils'

// ─── Types (mirror /api/crm/region/day-distribution response) ────────────────
type Region = 'A' | 'B' | 'C'
type TrialDay = 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
const DAYS: TrialDay[] = ['WED', 'THU', 'FRI', 'SAT', 'SUN']

type DayCounts = { CT: number; ENR: number }
type BranchRow = {
  branchId: string
  branchName: string
  shortName: string
  region: Region | null
  totals: DayCounts
  days: Record<TrialDay, DayCounts>
}
type ApiResponse = {
  asOfDate: string
  from: string
  to: string
  scope: 'all' | 'regional'
  availableRegions: Region[]
  overall: { totals: DayCounts; days: Record<TrialDay, DayCounts> }
  branches: BranchRow[]
}

// ─── Preset buttons ──────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'today',      label: 'Today' },
  { id: 'yesterday',  label: 'Yesterday' },
  { id: 'this_week',  label: 'This Week' },
  { id: 'last_week',  label: 'Last Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
] as const
type Preset = (typeof PRESETS)[number]['id']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

async function fetchDayDistribution(params: {
  preset: Preset
  region: 'all' | Region
  branchId: string
}): Promise<ApiResponse> {
  const sp = new URLSearchParams({
    preset:   params.preset,
    region:   params.region,
    branchId: params.branchId,
  })
  const res = await fetch(`/api/crm/region/day-distribution?${sp.toString()}`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<ApiResponse>
}

// ─── Day cell ─────────────────────────────────────────────────────────────────
function DayCell({ day, counts }: { day: TrialDay; counts: DayCounts }) {
  return (
    <div className="rounded-md border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {day}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2 font-bold text-xl tabular-nums">
        <span className={counts.CT > 0 ? 'text-red-500' : 'text-slate-600'}>{counts.CT}</span>
        <span className="text-slate-700">|</span>
        <span className={counts.ENR > 0 ? 'text-red-500' : 'text-slate-600'}>{counts.ENR}</span>
      </div>
    </div>
  )
}

// ─── Branch row (one per branch, plus the Overall row at top) ─────────────────
function GridRow({
  label,
  totals,
  days,
  emphasis,
}: {
  label: string
  totals: DayCounts
  days: Record<TrialDay, DayCounts>
  emphasis?: boolean
}) {
  const hasAny = totals.CT > 0 || totals.ENR > 0
  return (
    <div className="grid grid-cols-[200px_repeat(5,1fr)] items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
      <div className={cn('px-2', emphasis && 'font-semibold')}>
        <div className={cn('text-base', emphasis ? 'text-white' : 'text-slate-200')}>
          {label}
        </div>
        <div className="mt-0.5 text-xs font-mono">
          <span className="text-slate-500">[</span>
          <span className={totals.CT > 0 ? 'text-red-500' : 'text-slate-600'}>{totals.CT}</span>
          <span className="text-slate-600"> | </span>
          <span className={totals.ENR > 0 ? 'text-red-500' : 'text-slate-600'}>{totals.ENR}</span>
          <span className="text-slate-500">]</span>
          {!hasAny && <span className="ml-2 text-slate-700">no bookings</span>}
        </div>
      </div>
      {DAYS.map((d) => (
        <DayCell key={d} day={d} counts={days[d]} />
      ))}
    </div>
  )
}

// ─── Pill button (used by the preset / region / branch toolbars) ──────────────
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-white/70 bg-slate-900/70 text-white shadow-sm'
          : 'border-slate-700/50 bg-slate-800/40 text-slate-300 hover:border-slate-600 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export function RegionDashboard() {
  const [preset, setPreset] = useState<Preset>('this_week')
  const [region, setRegion] = useState<'all' | Region>('all')
  const [branchId, setBranchId] = useState<string>('all')

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['region-day-distribution', preset, region, branchId],
    queryFn:  () => fetchDayDistribution({ preset, region, branchId }),
  })

  // Region-pill visibility — restrict to what the API says is available.
  const visibleRegions = data?.availableRegions ?? []

  // Branch sub-selector — only show branches in the selected region.
  // The API already filters branches by region when region != 'all'; this
  // sub-selector just lets the user further narrow to ONE branch.
  const branchesInRegion = useMemo(() => {
    if (!data) return [] as BranchRow[]
    if (region === 'all') return data.branches
    return data.branches.filter((b) => b.region === region)
  }, [data, region])

  // When region changes, drop any branch focus from the previous region.
  function chooseRegion(next: 'all' | Region) {
    setRegion(next)
    setBranchId('all')
  }

  const asOfLabel = data ? shortDate(data.asOfDate) : '—'

  // The overall/per-branch rows to render. When a specific branch is selected,
  // we show just that one (and Overall mirrors its totals).
  const rowsToRender = useMemo(() => {
    if (!data) return [] as BranchRow[]
    if (branchId === 'all') return branchesInRegion
    return data.branches.filter((b) => b.branchId === branchId)
  }, [data, branchId, branchesInRegion])

  const overall = useMemo(() => {
    if (!data) return null
    if (branchId === 'all' && region === 'all') {
      return data.overall
    }
    // Recompute Overall from the visible subset (region or single-branch
    // focus) so the header total reflects what's on screen.
    const totals: DayCounts = { CT: 0, ENR: 0 }
    const days: Record<TrialDay, DayCounts> = {
      WED: { CT: 0, ENR: 0 },
      THU: { CT: 0, ENR: 0 },
      FRI: { CT: 0, ENR: 0 },
      SAT: { CT: 0, ENR: 0 },
      SUN: { CT: 0, ENR: 0 },
    }
    for (const b of rowsToRender) {
      totals.CT += b.totals.CT
      totals.ENR += b.totals.ENR
      for (const d of DAYS) {
        days[d].CT += b.days[d].CT
        days[d].ENR += b.days[d].ENR
      }
    }
    return { totals, days }
  }, [data, region, branchId, rowsToRender])

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Map className="h-6 w-6 mt-1 text-slate-400" />
          <div>
            <h1 className="text-2xl font-semibold text-white">Day Distribution</h1>
            <p className="mt-1 text-sm text-slate-400">
              CT bookings by trial day · {asOfLabel} · Each cell shows{' '}
              <span className="text-slate-300">CT | ENR</span>
              {data && (
                <span className="ml-2 text-slate-500">
                  · {data.scope === 'all' ? 'all regions' : 'your region(s)'}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className={cn(
            'flex items-center gap-2 rounded-md border border-slate-700/60 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-colors',
            isFetching && 'opacity-60',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Date preset row */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Pill key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
            {p.label}
          </Pill>
        ))}
      </div>

      {/* Region selector row */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill active={region === 'all'} onClick={() => chooseRegion('all')}>
          All Regions
        </Pill>
        {(['A', 'B', 'C'] as const).map((r) =>
          // Hide regions the caller can't access (e.g. a REGIONAL_MANAGER only
          // sees the region pill for their own region).
          visibleRegions.includes(r) || data?.scope === 'all' ? (
            <Pill key={r} active={region === r} onClick={() => chooseRegion(r)}>
              Region {r}
            </Pill>
          ) : null,
        )}
      </div>

      {/* Branch sub-selector row */}
      {branchesInRegion.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-3">
          <Pill active={branchId === 'all'} onClick={() => setBranchId('all')}>
            All
          </Pill>
          {branchesInRegion.map((b) => (
            <Pill
              key={b.branchId}
              active={branchId === b.branchId}
              onClick={() => setBranchId(b.branchId)}
            >
              {b.shortName}
            </Pill>
          ))}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
          Loading…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && rowsToRender.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
          No branches match the current filters. (Check that you have a region
          assigned on the branches you manage.)
        </div>
      )}

      {/* Grid: Overall + per-branch rows */}
      {!isLoading && rowsToRender.length > 0 && overall && (
        <div className="space-y-3 pt-2">
          <GridRow
            label="Overall"
            totals={overall.totals}
            days={overall.days}
            emphasis
          />
          {rowsToRender.map((b) => (
            <GridRow
              key={b.branchId}
              label={b.shortName}
              totals={b.totals}
              days={b.days}
            />
          ))}
        </div>
      )}
    </div>
  )
}
