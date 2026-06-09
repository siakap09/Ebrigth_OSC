"use client";

import { useState, useMemo } from "react";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import {
  Users, CheckCircle2, XCircle, CalendarClock, TrendingUp,
  Calendar, CalendarRange, BadgeCheck,
} from "lucide-react";
import { BRANCHES, BranchCode } from "@pcm/_types";
import {
  format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, isWithinInterval,
} from "date-fns";

type RangePreset = "thisWeek" | "thisMonth" | "thisYear" | "custom" | "all";

export default function DashboardPage() {
  const user = useCurrentUser();
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);
  const invitations = useFAStore(s => s.invitations);

  // Default to "all" so the dashboard isn't accidentally empty when the
  // current month happens to have no events yet. BMs can narrow down with
  // the range buttons.
  const [rangePreset, setRangePreset] = useState<RangePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const [branchFilter, setBranchFilter] = useState<BranchCode | "all">(
    user?.role === "BM" && user.branch ? user.branch : "all"
  );

  const effectiveBranch: BranchCode | "all" =
    user?.role === "BM" ? (user.branch ?? "all") : branchFilter;

  // Active date range
  const range = useMemo(() => {
    const now = new Date();
    if (rangePreset === "custom") {
      if (!customStart || !customEnd) return null;
      return { start: parseISO(customStart), end: parseISO(customEnd), label: `${customStart} → ${customEnd}` };
    }
    if (rangePreset === "thisWeek")  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }), label: "This week" };
    if (rangePreset === "thisMonth") return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, "MMMM yyyy") };
    if (rangePreset === "thisYear")  return { start: startOfYear(now),  end: endOfYear(now),  label: String(now.getFullYear()) };
    return null; // "all"
  }, [rangePreset, customStart, customEnd]);

  const eventsInRange = useMemo(() => {
    if (!range) return events;
    return events.filter(e =>
      isWithinInterval(parseISO(e.startDate), { start: range.start, end: range.end }),
    );
  }, [events, range]);

  const sessionIdsInRange = useMemo(
    () => new Set(sessions.filter(s => eventsInRange.some(e => e.id === s.eventId)).map(s => s.id)),
    [sessions, eventsInRange],
  );

  const filteredInvs = useMemo(() => {
    return invitations.filter(i => {
      if (!sessionIdsInRange.has(i.sessionId)) return false;
      if (effectiveBranch !== "all" && i.branch !== effectiveBranch) return false;
      return true;
    });
  }, [invitations, sessionIdsInRange, effectiveBranch]);

  const stats = useMemo(() => {
    const invited      = filteredInvs.length;
    const confirmed    = filteredInvs.filter(i => i.status === "confirmed" || i.status === "attended").length;
    const attended     = filteredInvs.filter(i => i.status === "attended").length;
    const absent       = filteredInvs.filter(i => i.status === "no_show" || i.status === "declined").length;
    const rescheduled  = filteredInvs.filter(i => i.status === "rescheduled").length;

    // Payment breakdown — academy wants visibility into who attended AND
    // paid, who attended but hasn't paid yet, and who didn't show.
    const attendedPaid    = filteredInvs.filter(i => i.status === "attended" && i.paid).length;
    const attendedUnpaid  = filteredInvs.filter(i => i.status === "attended" && !i.paid).length;
    const notAttended     = invited - attended;

    const progressInvs = filteredInvs.filter(i => i.inviteType === "progress");
    const renewalInvs  = filteredInvs.filter(i => i.inviteType === "renewal");
    const progressAttended = progressInvs.filter(i => i.status === "attended").length;
    const renewalAttended  = renewalInvs.filter(i => i.status === "attended").length;

    // Attendance rate = attended / invited (the user-specified formula)
    const attendancePct = invited > 0 ? Math.round((attended / invited) * 100) : 0;

    return {
      invited, confirmed, attended, absent, rescheduled,
      attendedPaid, attendedUnpaid, notAttended,
      progressInvited: progressInvs.length,
      progressAttended,
      renewalInvited: renewalInvs.length,
      renewalAttended,
      attendancePct,
    };
  }, [filteredInvs]);

  // Outcome breakdown scope. Paid/Unpaid only applies to RENEWAL students, so
  // "Overall" mixes in Progress attendees (who never pay) — the "PCM Renewal"
  // scope answers the payment question accurately.
  const [outcomeScope, setOutcomeScope] = useState<"overall" | "renewal">("overall");
  const outcomeInvs = useMemo(
    () => outcomeScope === "renewal" ? filteredInvs.filter(i => i.inviteType === "renewal") : filteredInvs,
    [filteredInvs, outcomeScope],
  );
  const outcomeStats = useMemo(() => {
    const invited = outcomeInvs.length;
    const attended = outcomeInvs.filter(i => i.status === "attended").length;
    return {
      paid: outcomeInvs.filter(i => i.status === "attended" && i.paid).length,
      attendedUnpaid: outcomeInvs.filter(i => i.status === "attended" && !i.paid).length,
      notAttended: invited - attended,
      invited,
    };
  }, [outcomeInvs]);

  // Per-(event, branch) breakdown. Each row is one branch within one event.
  // Branches with zero invitations in an event are skipped so the table
  // stays compact. When the page-level branch filter is set, only that
  // branch's rows survive.
  const eventBreakdown = useMemo(() => {
    type Row = {
      key: string;
      event: typeof events[number];
      branch: BranchCode;
      invited: number;
      confirmed: number;
      attended: number;
      absent: number;
      rescheduled: number;
      progress: number;
      renewal: number;
      pct: number;
      /** True for the FIRST row of an event group — the table renders the
       *  event name + date only on that row to visually group rows together. */
      isFirstOfEvent: boolean;
    };
    const rows: Row[] = [];
    const sortedEvents = [...eventsInRange].sort((a, b) =>
      b.startDate.localeCompare(a.startDate)
    );
    for (const event of sortedEvents) {
      const evInvs = filteredInvs.filter(i => i.eventId === event.id);
      // Branches touched by this event, ordered by their BRANCHES list index
      // so the table is stable across renders.
      const branchesInEvent = BRANCHES
        .map(b => b.code as BranchCode)
        .filter(code => evInvs.some(i => i.branch === code));
      let isFirst = true;
      for (const branch of branchesInEvent) {
        const branchInvs = evInvs.filter(i => i.branch === branch);
        const invited     = branchInvs.length;
        const confirmed   = branchInvs.filter(i => i.status === "confirmed" || i.status === "attended").length;
        const attended    = branchInvs.filter(i => i.status === "attended").length;
        const absent      = branchInvs.filter(i => i.status === "no_show" || i.status === "declined").length;
        const rescheduled = branchInvs.filter(i => i.status === "rescheduled").length;
        const progress    = branchInvs.filter(i => i.inviteType === "progress").length;
        const renewal     = branchInvs.filter(i => i.inviteType === "renewal").length;
        const pct = invited > 0 ? Math.round((attended / invited) * 100) : 0;
        rows.push({
          key: `${event.id}:${branch}`,
          event, branch, invited, confirmed, attended, absent, rescheduled,
          progress, renewal, pct, isFirstOfEvent: isFirst,
        });
        isFirst = false;
      }
    }
    return rows;
  }, [eventsInRange, filteredInvs]);

  const totalEventsShown = useMemo(
    () => new Set(eventBreakdown.map(r => r.event.id)).size,
    [eventBreakdown],
  );

  return (
    <AppShell>
      {/* Slimmer hero — keeps a single gradient as the visual anchor */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <TrendingUp className="absolute -right-4 -top-4 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          PCM · Dashboard
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Performance overview</h1>
        <p className="text-white/80 text-sm mt-1.5">
          {range ? range.label : "All events on record"}
          {effectiveBranch !== "all" && <> · Branch {effectiveBranch}</>}
        </p>
      </div>

      {/* Range + branch filter */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-violet-500" />
          <span className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.12em" }}>
            Show
          </span>
          <div className="inline-flex p-1 rounded-lg bg-ivory-100 border border-ivory-300">
            {([
              { id: "thisWeek",  label: "This week"  },
              { id: "thisMonth", label: "This month" },
              { id: "thisYear",  label: "This year"  },
              { id: "custom",    label: "Custom"     },
              { id: "all",       label: "All time"   },
            ] as { id: RangePreset; label: string }[]).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRangePreset(opt.id)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  rangePreset === opt.id
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-ink-600 hover:text-ink-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {rangePreset === "custom" && (
            <div className="flex items-center gap-2">
              <CalendarRange className="w-3.5 h-3.5 text-violet-500" />
              <input
                type="date"
                className="fa-input"
                style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
              <span className="text-xs text-ink-400">→</span>
              <input
                type="date"
                className="fa-input"
                style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={customEnd}
                min={customStart}
                onChange={e => setCustomEnd(e.target.value)}
              />
            </div>
          )}

          {user?.role !== "BM" && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="fa-mono text-[10px] uppercase text-ink-500" style={{ letterSpacing: "0.12em" }}>
                Branch
              </span>
              <select
                className="fa-input text-xs"
                style={{ minWidth: "160px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value as BranchCode | "all")}
              >
                <option value="all">All branches</option>
                {BRANCHES.map(b => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Big stat cards — quieter palette. Soft tinted background + colored
          accent strip on the left so each card has identity without screaming. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <CalmStatCard label="Invited"     value={stats.invited}     icon={Users}         accent="violet"  />
        <CalmStatCard label="Confirmed"   value={stats.confirmed}   icon={BadgeCheck}    accent="indigo"  />
        <CalmStatCard label="Attended"    value={stats.attended}    icon={CheckCircle2}  accent="emerald" />
        <CalmStatCard label="Absent"      value={stats.absent}      icon={XCircle}       accent="rose"    />
        <CalmStatCard label="Rescheduled" value={stats.rescheduled} icon={CalendarClock} accent="amber"   />
      </div>

      {/* Type split — Progress and Renewal each show "invited · attended" */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <TypeSplitCard
          label="PCM Progress"
          invited={stats.progressInvited}
          attended={stats.progressAttended}
          totalAttended={stats.attended}
          accent="violet"
        />
        <TypeSplitCard
          label="PCM Renewal"
          invited={stats.renewalInvited}
          attended={stats.renewalAttended}
          totalAttended={stats.attended}
          accent="cyan"
        />
      </div>

      {/* Payment breakdown — three buckets in one row with a stacked bar
          above. Academy wanted at-a-glance answer to "of everyone we
          invited, how many showed up and paid vs. came but haven't paid
          vs. didn't come at all". */}
      <PaymentBreakdown
        paid={outcomeStats.paid}
        attendedUnpaid={outcomeStats.attendedUnpaid}
        notAttended={outcomeStats.notAttended}
        totalInvited={outcomeStats.invited}
        scope={outcomeScope}
        onScopeChange={setOutcomeScope}
      />

      {/* Per-student list of who fell into which bucket. Useful for chasing
          up unpaid attendees and re-inviting the no-shows. Respects the same
          Overall / PCM Renewal scope toggle. */}
      <OutcomeStudentLists invitations={outcomeInvs} />

      {/* Attendance rate = attended / invited. Single calmer gradient card. */}
      <div className="rounded-2xl shadow-sm mb-6 border border-violet-200 bg-white overflow-hidden">
        <div className="bg-gradient-to-r from-violet-100 to-indigo-100 px-5 py-2 border-b border-violet-200">
          <div className="fa-mono text-[10px] uppercase text-violet-700 font-bold" style={{ letterSpacing: "0.14em" }}>
            Attendance rate
          </div>
        </div>
        <div className="p-6 flex items-center gap-6 flex-wrap">
          <div className="text-6xl font-black text-violet-700 leading-none">{stats.attendancePct}%</div>
          <div className="text-sm text-ink-500">
            <strong className="text-ink-900">{stats.attended}</strong> attended /
            <strong className="text-ink-900 ml-1">{stats.invited}</strong> invited
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="w-full h-2.5 bg-ivory-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
                style={{ width: `${stats.attendancePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* By-event-and-branch table — tone-matched header */}
      <div className="rounded-2xl bg-white shadow-sm border border-ivory-300 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-3 flex items-center justify-between border-b border-ivory-300">
          <h2 className="text-base font-semibold text-violet-900">By event &amp; branch</h2>
          <span className="text-xs text-ink-500">
            {totalEventsShown} event{totalEventsShown !== 1 ? "s" : ""} · {eventBreakdown.length} branch row{eventBreakdown.length !== 1 ? "s" : ""}
          </span>
        </div>
        {eventBreakdown.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            No invitations fall in this range.
          </div>
        ) : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Branch</th>
                <th>Invited</th>
                <th>Confirmed</th>
                <th>Attended</th>
                <th>Absent</th>
                <th>Rescheduled</th>
                <th>Progress</th>
                <th>Renewal</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {eventBreakdown.map(row => (
                <tr
                  key={row.key}
                  className={row.isFirstOfEvent ? "border-t-2 border-violet-200" : undefined}
                >
                  <td className="font-medium text-ink-900">
                    {row.isFirstOfEvent ? row.event.name : <span className="text-ink-300">·</span>}
                  </td>
                  <td className="text-xs text-ink-500 font-mono">
                    {row.isFirstOfEvent ? format(parseISO(row.event.startDate), "d MMM yyyy") : ""}
                  </td>
                  <td>
                    <span
                      className="fa-mono text-[11px] uppercase px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-bold"
                      style={{ letterSpacing: "0.06em" }}
                    >
                      {row.branch}
                    </span>
                  </td>
                  <td className="font-mono">{row.invited}</td>
                  <td className="font-mono text-indigo-700">{row.confirmed}</td>
                  <td className="font-mono text-emerald-700">{row.attended}</td>
                  <td className="font-mono text-rose-600">{row.absent}</td>
                  <td className="font-mono text-amber-700">{row.rescheduled}</td>
                  <td className="font-mono text-violet-700">{row.progress}</td>
                  <td className="font-mono text-cyan-700">{row.renewal}</td>
                  <td>
                    <span
                      className={`font-mono font-bold ${
                        row.pct >= 80 ? "text-emerald-600" : row.pct >= 50 ? "text-amber-600" : "text-rose-600"
                      }`}
                    >
                      {row.pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}

// ─── Card primitives ────────────────────────────────────────────────────

type Accent = "violet" | "indigo" | "emerald" | "rose" | "amber" | "cyan";

const ACCENTS: Record<Accent, { strip: string; text: string; bg: string; iconBg: string }> = {
  violet:  { strip: "bg-violet-500",  text: "text-violet-700",  bg: "bg-violet-50/60",  iconBg: "bg-violet-100  text-violet-600"  },
  indigo:  { strip: "bg-indigo-500",  text: "text-indigo-700",  bg: "bg-indigo-50/60",  iconBg: "bg-indigo-100  text-indigo-600"  },
  emerald: { strip: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50/60", iconBg: "bg-emerald-100 text-emerald-600" },
  rose:    { strip: "bg-rose-500",    text: "text-rose-700",    bg: "bg-rose-50/60",    iconBg: "bg-rose-100    text-rose-600"    },
  amber:   { strip: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50/60",   iconBg: "bg-amber-100   text-amber-600"   },
  cyan:    { strip: "bg-cyan-500",    text: "text-cyan-700",    bg: "bg-cyan-50/60",    iconBg: "bg-cyan-100    text-cyan-600"    },
};

function CalmStatCard({
  label, value, icon: Icon, accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <div className={`relative rounded-xl ${a.bg} border border-ivory-300 shadow-sm p-4 overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.strip}`} aria-hidden="true" />
      <div className="flex items-start justify-between pl-2">
        <div
          className={`fa-mono text-[10px] uppercase ${a.text} font-bold`}
          style={{ letterSpacing: "0.14em" }}
        >
          {label}
        </div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${a.iconBg}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-3xl font-black text-ink-900 mt-2 pl-2">{value}</div>
    </div>
  );
}

function TypeSplitCard({
  label, invited, attended, totalAttended, accent,
}: {
  label: string;
  invited: number;
  attended: number;
  totalAttended: number;
  accent: Accent;
}) {
  // Two ratios surfaced for the BM:
  //   • internal: this type's attendance rate  (attended / invited)
  //   • of total attended: what share of overall attendance came from this type
  const internalPct = invited > 0 ? Math.round((attended / invited) * 100) : 0;
  const shareOfAttended = totalAttended > 0 ? Math.round((attended / totalAttended) * 100) : 0;
  const a = ACCENTS[accent];
  return (
    <div className={`relative rounded-xl ${a.bg} border border-ivory-300 shadow-sm overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.strip}`} aria-hidden="true" />
      <div className="p-4 pl-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-base font-bold ${a.text}`}>{label}</h3>
          <span className={`fa-mono text-[10px] font-bold ${a.text}`} style={{ letterSpacing: "0.06em" }}>
            {internalPct}%
          </span>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-black text-ink-900">{invited}</span>
          <span className="text-sm text-ink-500">invited</span>
          <span className="text-ink-300 mx-1">·</span>
          <span className="text-2xl font-bold text-ink-900">{attended}</span>
          <span className="text-sm text-ink-500">attended</span>
        </div>
        <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-ivory-300">
          <div
            className={`h-full ${a.strip} rounded-full transition-all`}
            style={{ width: `${internalPct}%` }}
          />
        </div>
        <div className="text-[11px] text-ink-500 mt-2">
          {shareOfAttended}% of total attended is {label.replace("PCM ", "")}
        </div>
      </div>
    </div>
  );
}

/**
 * Three-bucket payment breakdown. Shows a stacked horizontal bar (Paid
 * green / Attended-Unpaid amber / Not Attended rose) plus three cards
 * underneath with the same colour palette so the eye picks out the
 * mapping immediately.
 */
function PaymentBreakdown({
  paid, attendedUnpaid, notAttended, totalInvited, scope, onScopeChange,
}: {
  paid: number;
  attendedUnpaid: number;
  notAttended: number;
  totalInvited: number;
  scope: "overall" | "renewal";
  onScopeChange: (s: "overall" | "renewal") => void;
}) {
  // Pct each bucket contributes to total invited — used both for bar
  // widths and for the small "X% of invited" sub-text on each card.
  const pct = (n: number) => (totalInvited > 0 ? Math.round((n / totalInvited) * 100) : 0);
  const paidPct       = pct(paid);
  const unpaidPct     = pct(attendedUnpaid);
  const notAttendedPct= pct(notAttended);

  return (
    <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h3 className="fa-display text-base text-ink-900">Outcome breakdown</h3>
          {/* Overall vs PCM Renewal — paid/unpaid is only meaningful for renewals */}
          <div className="inline-flex rounded-lg border border-ivory-300 overflow-hidden text-[11px] font-semibold">
            {(["overall", "renewal"] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onScopeChange(s)}
                className={`px-3 py-1 transition-colors ${
                  scope === s ? "bg-violet-600 text-white" : "bg-white text-ink-500 hover:bg-ivory-100"
                }`}
              >
                {s === "overall" ? "Overall" : "PCM Renewal"}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11px] text-ink-500">
          across {totalInvited} {scope === "renewal" ? "renewal" : "invited"} student{totalInvited !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Stacked bar */}
      <div
        className="w-full h-4 rounded-full overflow-hidden flex bg-ivory-100 border border-ivory-300 mb-3"
        role="img"
        aria-label={`Paid ${paid}, attended unpaid ${attendedUnpaid}, not attended ${notAttended}`}
      >
        {paid > 0 && (
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${paidPct}%` }}
            title={`Paid: ${paid} (${paidPct}%)`}
          />
        )}
        {attendedUnpaid > 0 && (
          <div
            className="h-full bg-amber-400"
            style={{ width: `${unpaidPct}%` }}
            title={`Attended unpaid: ${attendedUnpaid} (${unpaidPct}%)`}
          />
        )}
        {notAttended > 0 && (
          <div
            className="h-full bg-rose-400"
            style={{ width: `${notAttendedPct}%` }}
            title={`Not attended: ${notAttended} (${notAttendedPct}%)`}
          />
        )}
      </div>

      {/* Three cards */}
      <div className="grid grid-cols-3 gap-3">
        <BucketCard
          label="Attended & Paid"
          value={paid}
          pct={paidPct}
          accentBg="bg-emerald-50"
          accentBorder="border-emerald-200"
          accentText="text-emerald-700"
          accentDot="bg-emerald-500"
        />
        <BucketCard
          label="Attended · Unpaid"
          value={attendedUnpaid}
          pct={unpaidPct}
          accentBg="bg-amber-50"
          accentBorder="border-amber-200"
          accentText="text-amber-700"
          accentDot="bg-amber-400"
        />
        <BucketCard
          label="Not Attended"
          value={notAttended}
          pct={notAttendedPct}
          accentBg="bg-rose-50"
          accentBorder="border-rose-200"
          accentText="text-rose-700"
          accentDot="bg-rose-400"
        />
      </div>
    </div>
  );
}

function BucketCard({
  label, value, pct, accentBg, accentBorder, accentText, accentDot,
}: {
  label: string; value: number; pct: number;
  accentBg: string; accentBorder: string; accentText: string; accentDot: string;
}) {
  return (
    <div className={`rounded-xl ${accentBg} ${accentBorder} border p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${accentDot}`} aria-hidden="true" />
        <span
          className={`fa-mono text-[10px] uppercase ${accentText} font-bold`}
          style={{ letterSpacing: "0.1em" }}
        >
          {label}
        </span>
      </div>
      <div className="text-3xl font-black text-ink-900 leading-none">{value}</div>
      <div className="text-[11px] text-ink-500 mt-1">{pct}% of invited</div>
    </div>
  );
}

/**
 * Three side-by-side lists naming the students in each outcome bucket.
 * Sits below the stacked breakdown bar and complements its numbers with
 * actionable names — academy wants to chase up the unpaid attendees and
 * re-invite the no-shows.
 *
 * The page already computed `filteredInvs` (event range + branch filter
 * applied), so this component just buckets them and renders.
 */
function OutcomeStudentLists({ invitations }: { invitations: import("@pcm/_types").Invitation[] }) {
  const students = useFAStore(s => s.students);
  const events = useFAStore(s => s.events);
  const sessions = useFAStore(s => s.sessions);

  // Small lookups so the row rendering stays cheap regardless of how
  // many invitations are in the bucket.
  const studentsById = useMemo(() => {
    const m = new Map<string, import("@pcm/_types").Student>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);
  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) m.set(e.id, e.name);
    return m;
  }, [events]);
  const sessionLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) m.set(s.id, `D${s.dayNumber}·S${s.sessionNumber} ${s.startTime}`);
    return m;
  }, [sessions]);

  const paid           = invitations.filter(i => i.status === "attended" && i.paid);
  const attendedUnpaid = invitations.filter(i => i.status === "attended" && !i.paid);
  const notAttended    = invitations.filter(i => i.status !== "attended");

  function rowOf(inv: import("@pcm/_types").Invitation) {
    const student = studentsById.get(inv.studentId);
    return {
      key: inv.id,
      name: student?.name ?? `#${inv.studentId}`,
      branch: inv.branch,
      grade: inv.targetGrade || student?.grade || "?",
      eventName: eventNameById.get(inv.eventId) ?? "—",
      sessionLabel: sessionLabel.get(inv.sessionId) ?? "—",
    };
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
      <OutcomeBucket
        title="Attended & Paid"
        rows={paid.map(rowOf)}
        accentBg="bg-emerald-50"
        accentBorder="border-emerald-200"
        accentText="text-emerald-700"
      />
      <OutcomeBucket
        title="Attended · Unpaid"
        rows={attendedUnpaid.map(rowOf)}
        accentBg="bg-amber-50"
        accentBorder="border-amber-200"
        accentText="text-amber-700"
      />
      <OutcomeBucket
        title="Not Attended"
        rows={notAttended.map(rowOf)}
        accentBg="bg-rose-50"
        accentBorder="border-rose-200"
        accentText="text-rose-700"
      />
    </div>
  );
}

function OutcomeBucket({
  title, rows, accentBg, accentBorder, accentText,
}: {
  title: string;
  rows: Array<{ key: string; name: string; branch: string; grade: number | string; eventName: string; sessionLabel: string }>;
  accentBg: string; accentBorder: string; accentText: string;
}) {
  return (
    <div className={`rounded-xl ${accentBg} ${accentBorder} border overflow-hidden flex flex-col`} style={{ minHeight: 200 }}>
      <div className="px-4 py-2 border-b border-ivory-300 flex items-center justify-between">
        <span
          className={`fa-mono text-[10px] uppercase ${accentText} font-bold`}
          style={{ letterSpacing: "0.1em" }}
        >
          {title}
        </span>
        <span className={`fa-mono text-[11px] ${accentText} font-bold`}>{rows.length}</span>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2 space-y-1.5 flex-1">
        {rows.length === 0 ? (
          <div className="p-3 text-center text-xs text-ink-400 italic">No students in this bucket.</div>
        ) : (
          rows.map(r => (
            <div
              key={r.key}
              className="px-2.5 py-1.5 rounded bg-white border border-ivory-300 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink-900 truncate">{r.name}</span>
                <span className="fa-mono text-[10px] font-bold text-ink-500 flex-shrink-0">
                  {r.branch} · G{r.grade}
                </span>
              </div>
              <div className="text-[10px] text-ink-500 mt-0.5 truncate">
                {r.eventName} · {r.sessionLabel}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
