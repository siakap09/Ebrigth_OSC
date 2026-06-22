import { TrendingUp, Users, UserRoundCheck, Filter } from "lucide-react";
import { getDashboardMetrics } from "@/lib/recruitment/data";
import { PageHeader } from "../_components/placeholders";

export const dynamic = "force-dynamic";

// Stage colour token → static bar class (Tailwind can't see dynamic names).
const BAR: Record<string, string> = {
  slate: "bg-slate-400", zinc: "bg-zinc-400", sky: "bg-sky-500", cyan: "bg-cyan-500",
  indigo: "bg-indigo-500", violet: "bg-violet-500", amber: "bg-amber-500",
  emerald: "bg-emerald-500", teal: "bg-teal-500", rose: "bg-rose-500",
  green: "bg-green-500", lime: "bg-lime-500",
};

export default async function RecruitmentDashboardPage() {
  const m = await getDashboardMetrics();
  const maxCount = Math.max(1, ...m.stages.map((s) => s.count));
  const active = m.total - m.hired;

  const kpis = [
    { label: "Total Recruits", value: m.total, hint: "All applicants", icon: Users, accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "Hired", value: m.hired, hint: "Matched to staff (since Jan)", icon: UserRoundCheck, accent: "text-green-600 dark:text-green-400" },
    { label: "In Pipeline", value: active, hint: "Not yet hired", icon: Filter, accent: "text-sky-600 dark:text-sky-400" },
    { label: "Recruitment Rate", value: `${(m.rate * 100).toFixed(1)}%`, hint: "Hired / total", icon: TrendingUp, accent: "text-teal-600 dark:text-teal-400" },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Recruitment Dashboard" subtitle="Hiring funnel and recruitment activity across HR" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</span>
                <Icon className={`h-4 w-4 ${k.accent}`} />
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{k.value}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{k.hint}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Pipeline by stage</h2>
        <div className="space-y-1.5">
          {m.stages.map((s) => (
            <div key={s.shortCode} className="flex items-center gap-3">
              <div className="w-44 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300" title={s.name}>{s.name}</div>
              <div className="flex-1">
                <div
                  className={`h-5 rounded ${BAR[s.color] ?? "bg-slate-400"}`}
                  style={{ width: `${Math.max(s.count ? 3 : 0, (s.count / maxCount) * 100)}%` }}
                />
              </div>
              <div className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{s.count}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
