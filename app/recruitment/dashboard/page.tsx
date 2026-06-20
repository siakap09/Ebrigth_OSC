import { TrendingUp, Users, Kanban, UserRoundCheck, Clock } from 'lucide-react'
import { PageHeader } from '../_components/placeholders'

// KPI cards for the recruitment funnel. Values are placeholders ("—") until the
// data layer is wired to the recruitment schema. The card set mirrors the
// CRM's leads dashboard shape but with HR-recruitment semantics.
const KPIS = [
  { key: 'rate',       label: 'Recruitment Rate', hint: 'Hired / Applied',  icon: TrendingUp,     accent: 'emerald' },
  { key: 'applied',    label: 'New Applicants',   hint: 'This period',      icon: Users,          accent: 'teal' },
  { key: 'inPipeline', label: 'In Pipeline',      hint: 'Active recruits',  icon: Kanban,         accent: 'sky' },
  { key: 'interview',  label: 'In Interview',     hint: 'Scheduled',        icon: Clock,          accent: 'amber' },
  { key: 'hired',      label: 'Hired',            hint: 'This period',      icon: UserRoundCheck, accent: 'green' },
] as const

const ACCENT: Record<string, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  teal:    'text-teal-600 dark:text-teal-400',
  sky:     'text-sky-600 dark:text-sky-400',
  amber:   'text-amber-600 dark:text-amber-400',
  green:   'text-green-600 dark:text-green-400',
}

export default function RecruitmentDashboardPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Recruitment Dashboard"
        subtitle="Hiring funnel and recruitment activity across HR"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {KPIS.map((k) => {
          const Icon = k.icon
          return (
            <div
              key={k.key}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {k.label}
                </span>
                <Icon className={`h-4 w-4 ${ACCENT[k.accent]}`} />
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-300 dark:text-slate-600">—</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{k.hint}</p>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/60 p-6 text-sm text-slate-500 dark:border-emerald-950/40 dark:bg-slate-900/40 dark:text-slate-400">
        Charts (recruitment rate over time, source breakdown, time-to-hire) and live
        figures will populate here once the recruitment database schema is connected.
      </div>
    </div>
  )
}
