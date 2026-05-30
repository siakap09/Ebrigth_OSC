"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { AppShell } from "@fa/_components/shared/AppShell";
import {
  BRANCHES, BranchCode, FA_REPORT_MAX_PER_CRITERION, faReportTotal,
} from "@fa/_types";
import {
  ClipboardCheck, Search, Printer, Pencil, FileText, Users,
  FilterIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";

type FilledFilter = "all" | "filled" | "pending";

export default function FaReportsListPage() {
  const user = useCurrentUser();
  const reports     = useFAStore(s => s.reports);
  const invitations = useFAStore(s => s.invitations);
  const events      = useFAStore(s => s.events);
  const students    = useFAStore(s => s.students);

  const [branch, setBranch]   = useState<BranchCode | "all">(
    user?.role === "BM" && user.branch ? user.branch : "all"
  );
  const [eventId, setEventId] = useState<string>("all");
  const [search,  setSearch]  = useState("");
  const [filled,  setFilled]  = useState<FilledFilter>("all");

  const effectiveBranch: BranchCode | "all" =
    user?.role === "BM" ? (user.branch ?? "all") : branch;

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events],
  );

  // Pre-index for cheap lookups inside the row build.
  const studentsById = useMemo(() => {
    const m = new Map<string, typeof students[number]>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);
  const reportByInvId = useMemo(() => {
    const m = new Map<string, typeof reports[number]>();
    for (const r of reports) m.set(r.invitationId, r);
    return m;
  }, [reports]);
  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) m.set(e.id, e.name);
    return m;
  }, [events]);

  // The list is anchored on "every attended invitation" — that's the set
  // of students who actually showed up to the showcase. Each row carries
  // the report (if filled) so Marketing can see at a glance which are
  // still pending. We don't anchor on "reports only" because then a
  // not-yet-filled student would disappear from the list.
  const rows = useMemo(() => {
    const attended = invitations.filter(i => i.status === "attended");
    const list = attended.map(inv => {
      const student = studentsById.get(inv.studentId);
      const report  = reportByInvId.get(inv.id);
      // Prefer the live student record; fall back to anything snapshotted
      // on the report (if one exists); finally use the bare ID.
      const name  = student?.name  ?? report?.studentName ?? `#${inv.studentId}`;
      const grade = inv.targetGrade || student?.grade || report?.grade || 0;
      return {
        invitationId: inv.id,
        studentId: inv.studentId,
        name,
        branch: inv.branch,
        grade,
        eventId: inv.eventId,
        eventName: eventNameById.get(inv.eventId) ?? "—",
        attendedAt: inv.attendanceMarkedAt ?? inv.invitedAt,
        report,
      };
    });
    // Filter pass: branch, event, filled-status, search.
    return list
      .filter(r => effectiveBranch === "all" || r.branch === effectiveBranch)
      .filter(r => eventId === "all" || r.eventId === eventId)
      .filter(r => filled === "all"
        ? true
        : filled === "filled" ? !!r.report : !r.report,
      )
      .filter(r => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.studentId.toLowerCase().includes(q) ||
          (r.report?.preparedBy ?? "").toLowerCase().includes(q)
        );
      })
      // Filled reports float to the top by updatedAt desc; pending rows
      // sort by attendance time so the most recent showcase appears first.
      .sort((a, b) => {
        if (a.report && b.report) return b.report.updatedAt.localeCompare(a.report.updatedAt);
        if (a.report) return -1;
        if (b.report) return 1;
        return (b.attendedAt ?? "").localeCompare(a.attendedAt ?? "");
      });
  }, [invitations, studentsById, reportByInvId, eventNameById, effectiveBranch, eventId, filled, search]);

  const totalAttended = useMemo(
    () => rows.length === 0 ? 0 : rows.length, // already filtered set
    [rows],
  );
  const totalFilled = useMemo(() => rows.filter(r => r.report).length, [rows]);
  const coverage = totalAttended === 0 ? 0 : Math.round((totalFilled / totalAttended) * 100);

  // Bulk-print IDs — only the rows with a saved report can be printed,
  // since the cert needs scoring + remarks to render.
  const printIds = rows.filter(r => r.report).map(r => r.invitationId);

  return (
    <AppShell>
      {/* Hero */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-r from-rose-600 to-red-600 text-white">
        <ClipboardCheck className="absolute -right-4 -top-6 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          FA · Showcase reports
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Foundation Appraisal reports</h1>
        <p className="text-white/80 text-sm mt-1.5">
          {totalAttended} student{totalAttended !== 1 ? "s" : ""} attended the showcase
          {totalAttended > 0 && (
            <> · <strong className="text-white">{totalFilled}</strong> filled ({coverage}%)</>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <FilterIcon className="w-4 h-4 text-rose-500" />
        <select
          className="fa-input text-xs"
          style={{ minWidth: "260px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
          value={eventId}
          onChange={e => setEventId(e.target.value)}
        >
          <option value="all">All events</option>
          {sortedEvents.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name} ({format(parseISO(ev.startDate), "d MMM yyyy")})
            </option>
          ))}
        </select>

        {user?.role !== "BM" && (
          <select
            className="fa-input text-xs"
            style={{ minWidth: "180px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            value={branch}
            onChange={e => setBranch(e.target.value as BranchCode | "all")}
          >
            <option value="all">All branches</option>
            {BRANCHES.map(b => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>
        )}

        {/* Filled / pending toggle */}
        <div className="inline-flex p-1 rounded-lg bg-ivory-100 border border-ivory-300">
          {([
            { id: "all",     label: "All"     },
            { id: "filled",  label: "Filled"  },
            { id: "pending", label: "Pending" },
          ] as { id: FilledFilter; label: string }[]).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilled(opt.id)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                filled === opt.id
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
          <input
            className="fa-input fa-input-icon-left text-xs"
            style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            placeholder="Search student name, ID, or filler…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-rose-50 to-red-50 px-5 py-3 border-b border-ivory-300 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-rose-900">Showcase attendees</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
            {printIds.length > 0 && (
              <Link
                href={`/fa-system/shared/reports/print?ids=${printIds.map(id => encodeURIComponent(id)).join(",")}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold shadow-sm
                           bg-gradient-to-r from-rose-600 to-red-600
                           hover:from-rose-700 hover:to-red-700 transition-all"
                title="Open all filled reports in one window and print → save as PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                Export {printIds.length} as PDF
              </Link>
            )}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Branch</th>
                <th>Grade</th>
                <th>Event</th>
                <th>Status</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const r = row.report;
                const total = r ? faReportTotal(r) : null;
                const totalMax = FA_REPORT_MAX_PER_CRITERION * 4;
                return (
                  <tr key={row.invitationId} className={r ? "bg-emerald-50/40" : "bg-amber-50/40"}>
                    <td>
                      <div className="font-medium text-ink-900">{row.name}</div>
                      <div className="text-xs text-ink-400">#{row.studentId}</div>
                    </td>
                    <td>
                      <span
                        className="fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold"
                        style={{ letterSpacing: "0.06em" }}
                      >
                        {row.branch}
                      </span>
                    </td>
                    <td className="font-mono text-sm">G{row.grade || "?"}</td>
                    <td className="text-xs text-ink-700">{row.eventName}</td>
                    <td>
                      {r ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold uppercase bg-emerald-100 text-emerald-700 border border-emerald-300" style={{ letterSpacing: "0.06em" }}>
                          <ClipboardCheck className="w-3 h-3" /> Filled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-300" style={{ letterSpacing: "0.06em" }}>
                          <FileText className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td>
                      {total !== null ? (
                        <span className="font-mono text-sm font-bold text-emerald-700">
                          {total} <span className="text-ink-400">/ {totalMax}</span>
                        </span>
                      ) : (
                        <span className="text-ink-300 italic text-xs">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/fa-system/shared/reports/${row.invitationId}`}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border ${
                            r
                              ? "border-ivory-300 bg-white text-ink-700 hover:bg-ivory-100"
                              : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          }`}
                          title={r ? "Edit report" : "Fill report"}
                        >
                          <Pencil className="w-3 h-3" /> {r ? "Edit" : "Fill"}
                        </Link>
                        {r && (
                          <Link
                            href={`/fa-system/shared/reports/${row.invitationId}/certificate`}
                            target="_blank"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            title="Open printable certificate"
                          >
                            <Printer className="w-3 h-3" /> Print
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="p-10 text-center">
      <div className="w-14 h-14 rounded-full bg-ivory-100 mx-auto mb-3 flex items-center justify-center">
        <Users className="w-6 h-6 text-ink-400" />
      </div>
      <div className="text-sm text-ink-500">No showcase attendees match these filters.</div>
      <div className="text-xs text-ink-400 mt-1">
        Mark students &quot;Attended&quot; on the Attendance page first — they&apos;ll show up here ready for a report.
      </div>
    </div>
  );
}
