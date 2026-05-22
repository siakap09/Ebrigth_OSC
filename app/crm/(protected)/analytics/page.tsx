'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TicketIcon,
  Clock,
  XCircle,
  TrendingUp,
  Inbox,
  PlayCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/crm/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Analytics {
  period: { days: number; from: string }
  totals: {
    all: number
    received: number
    in_progress: number
    complete: number
    rejected: number
  }
  byPlatform: Array<{
    id: string
    name: string
    code: string
    accent_color: string
    total: number
    open: number
    completed: number
  }>
  topBranches: Array<{
    id: string
    name: string
    code: string
    branch_number: string
    total: number
  }>
  trend: Array<{ date: string; count: number }>
  avgResolutionHours: number
  rejectionRate: number
  topAdmins: Array<{ id: string; name: string; email: string; count: number }>
}

export default function AnalyticsPage() {
  const [days, setDays] = useState('30')

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ['ticket-analytics', days],
    queryFn: async () => {
      const res = await fetch(`/api/crm/tickets/analytics?days=${days}`)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
  })

  const totalOpen = (data?.totals.received ?? 0) + (data?.totals.in_progress ?? 0)
  const completionRate = data?.totals.all ? ((data.totals.complete / data.totals.all) * 100) : 0

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ticket module overview — {data?.period.days ?? days} day window
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : !data ? (
        <EmptyCard message="Failed to load analytics." />
      ) : (
        <>
          {/* Top row — KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={TicketIcon}
              tint="indigo"
              label="Total Tickets"
              value={data.totals.all}
              sublabel={`${data.totals.all === 0 ? 'No activity' : `${totalOpen} open · ${data.totals.complete} completed`}`}
            />
            <KpiCard
              icon={Clock}
              tint="blue"
              label="Avg Resolution"
              value={
                data.avgResolutionHours > 0
                  ? data.avgResolutionHours < 24
                    ? `${data.avgResolutionHours.toFixed(1)}h`
                    : `${(data.avgResolutionHours / 24).toFixed(1)}d`
                  : '—'
              }
              sublabel="time from creation to complete"
            />
            <KpiCard
              icon={TrendingUp}
              tint="emerald"
              label="Completion Rate"
              value={`${completionRate.toFixed(0)}%`}
              sublabel={`${data.totals.complete} of ${data.totals.all} resolved`}
            />
            <KpiCard
              icon={XCircle}
              tint="rose"
              label="Rejection Rate"
              value={`${(data.rejectionRate * 100).toFixed(0)}%`}
              sublabel={`${data.totals.rejected} rejected`}
            />
          </div>

          {/* Status distribution */}
          <Card title="Status Distribution">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatusCell icon={Inbox}        label="Received"    value={data.totals.received}    total={data.totals.all} tint="slate" />
              <StatusCell icon={PlayCircle}   label="In Progress" value={data.totals.in_progress} total={data.totals.all} tint="blue" />
              <StatusCell icon={CheckCircle2} label="Complete"    value={data.totals.complete}    total={data.totals.all} tint="emerald" />
              <StatusCell icon={XCircle}      label="Rejected"    value={data.totals.rejected}    total={data.totals.all} tint="rose" />
            </div>
          </Card>

          {/* Two-col */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Tickets by Platform">
              {data.byPlatform.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No tickets yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.byPlatform.map((p) => {
                    const pct = data.totals.all ? (p.total / data.totals.all) * 100 : 0
                    return (
                      <div key={p.id}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: p.accent_color }}
                            />
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {p.name}
                            </span>
                            <span className="font-mono text-xs text-slate-500">({p.code})</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span>{p.open} open</span>
                            <span>{p.completed} done</span>
                            <span className="font-mono text-slate-700 dark:text-slate-200">
                              {p.total}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: p.accent_color,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card title="Top Branches by Volume">
              {data.topBranches.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No tickets yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.topBranches.map((b, i) => {
                    const pct = data.topBranches[0].total ? (b.total / data.topBranches[0].total) * 100 : 0
                    return (
                      <div key={b.id} className="flex items-center gap-3">
                        <span className="w-6 text-right font-mono text-xs text-slate-400">
                          #{i + 1}
                        </span>
                        <span className="w-8 font-mono text-xs text-slate-500">{b.branch_number}</span>
                        <span className="flex-1 truncate text-sm text-slate-800 dark:text-slate-200">
                          {b.name}
                        </span>
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div
                            className="h-full bg-indigo-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {b.total}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Daily trend + admins */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title="Daily Trend">
                {data.trend.every((d) => d.count === 0) ? (
                  <p className="py-4 text-sm text-slate-500">No tickets in this period.</p>
                ) : (
                  <Sparkline points={data.trend} />
                )}
              </Card>
            </div>
            <Card title="Top Admins">
              {data.topAdmins.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No assignments yet.</p>
              ) : (
                <ol className="space-y-3">
                  {data.topAdmins.map((a, i) => (
                    <li key={a.id} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {a.name}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{a.email}</div>
                      </div>
                      <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {a.count}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Generic card ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {children}
    </div>
  )
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      {message}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

const TINTS = {
  indigo:  'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
  blue:    'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  rose:    'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
  slate:   'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
} as const
type Tint = keyof typeof TINTS

function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sublabel?: string
  tint: Tint
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {value}
          </div>
          {sublabel && (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sublabel}</div>
          )}
        </div>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', TINTS[tint])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

// ─── Status cell ──────────────────────────────────────────────────────────────

function StatusCell({
  icon: Icon,
  label,
  value,
  total,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  total: number
  tint: Tint
}) {
  const pct = total ? (value / total) * 100 : 0
  return (
    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', TINTS[tint])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {pct.toFixed(0)}%
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={cn('h-full', {
            'bg-slate-400 dark:bg-slate-500': tint === 'slate',
            'bg-blue-500': tint === 'blue',
            'bg-emerald-500': tint === 'emerald',
            'bg-rose-500': tint === 'rose',
            'bg-indigo-500': tint === 'indigo',
          })}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ points }: { points: Array<{ date: string; count: number }> }) {
  const width = 700
  const height = 160
  const pad = { t: 12, r: 12, b: 20, l: 28 }
  const max = Math.max(1, ...points.map((p) => p.count))
  const stepX = (width - pad.l - pad.r) / Math.max(1, points.length - 1)

  const pathD = points
    .map((p, i) => {
      const x = pad.l + i * stepX
      const y = pad.t + (height - pad.t - pad.b) * (1 - p.count / max)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  const areaD = `${pathD} L ${(pad.l + (points.length - 1) * stepX).toFixed(1)} ${height - pad.b} L ${pad.l} ${height - pad.b} Z`

  // Gridlines
  const gridY = [0.25, 0.5, 0.75].map((f) => pad.t + (height - pad.t - pad.b) * f)

  // X-axis labels (show first, middle, last)
  const labelIdx = points.length > 4 ? [0, Math.floor(points.length / 2), points.length - 1] : points.map((_, i) => i)

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-40 w-full text-indigo-500"
      >
        {gridY.map((y, i) => (
          <line
            key={i}
            x1={pad.l}
            y1={y}
            x2={width - pad.r}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="3 3"
          />
        ))}
        <path d={areaD} fill="currentColor" fillOpacity="0.12" />
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" />
        {points.map((p, i) => {
          if (!labelIdx.includes(i)) return null
          const x = pad.l + i * stepX
          return (
            <text
              key={p.date}
              x={x}
              y={height - 4}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {new Date(p.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </text>
          )
        })}
        <text x={pad.l - 4} y={pad.t + 4} textAnchor="end" className="fill-slate-500 text-[10px]">
          {max}
        </text>
        <text x={pad.l - 4} y={height - pad.b} textAnchor="end" className="fill-slate-500 text-[10px]">
          0
        </text>
      </svg>
    </div>
  )
}
