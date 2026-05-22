"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useFAStore } from "@pcm/_lib/store";
import { useCurrentUser } from "@pcm/_hooks/useCurrentUser";
import { AppShell } from "@pcm/_components/shared/AppShell";
import { BRANCHES, BranchCode } from "@pcm/_types";
import { ClipboardCheck, Search, Printer, Pencil, Printer as PrinterAll } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function ReportsListPage() {
  const user = useCurrentUser();
  const reports     = useFAStore(s => s.reports);
  const invitations = useFAStore(s => s.invitations);
  const events      = useFAStore(s => s.events);

  const [branch, setBranch] = useState<BranchCode | "all">(
    user?.role === "BM" && user.branch ? user.branch : "all"
  );
  const [eventId, setEventId] = useState<string>("all");
  const [search, setSearch]   = useState("");

  const effectiveBranch: BranchCode | "all" =
    user?.role === "BM" ? (user.branch ?? "all") : branch;

  const filtered = useMemo(() => {
    let list = [...reports];
    if (effectiveBranch !== "all") list = list.filter(r => r.branch === effectiveBranch);
    if (eventId !== "all") {
      // Reports don't carry event_id directly — bridge via the invitation
      // they belong to. Filter by reports whose invitation is in this event.
      const matchInvIds = new Set(invitations.filter(i => i.eventId === eventId).map(i => i.id));
      list = list.filter(r => matchInvIds.has(r.invitationId));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.studentName.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q) ||
        r.preparedBy.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [reports, effectiveBranch, eventId, search, invitations]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [events],
  );

  // Total possible reports = attended invitations within filter.
  // Used to surface a "X of Y filled" coverage stat at the top.
  const attendedInvitations = useMemo(() => {
    let invs = invitations.filter(i => i.status === "attended");
    if (effectiveBranch !== "all") invs = invs.filter(i => i.branch === effectiveBranch);
    if (eventId !== "all")          invs = invs.filter(i => i.eventId === eventId);
    return invs;
  }, [invitations, effectiveBranch, eventId]);

  const coverage = attendedInvitations.length === 0
    ? 0
    : Math.round((filtered.length / attendedInvitations.length) * 100);

  return (
    <AppShell>
      {/* Hero */}
      <div className="mb-6 relative overflow-hidden rounded-2xl p-6
                      bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
        <ClipboardCheck className="absolute -right-4 -top-6 w-32 h-32 text-white/10" aria-hidden="true" />
        <div className="fa-mono text-[10px] uppercase text-white/80 mb-1" style={{ letterSpacing: "0.14em" }}>
          PCM · Assessment reports
        </div>
        <h1 className="text-3xl font-bold tracking-tight">All filled reports</h1>
        <p className="text-white/80 text-sm mt-1.5">
          {filtered.length} report{filtered.length !== 1 ? "s" : ""}
          {attendedInvitations.length > 0 && (
            <> · {coverage}% of attended students assessed</>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-white border border-ivory-300 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <select
          className="fa-input text-xs"
          style={{ minWidth: "260px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
          value={eventId}
          onChange={e => setEventId(e.target.value)}
        >
          <option value="all">All events</option>
          {sortedEvents.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name} ({format(parseISO(ev.startDate), "d MMM")})
            </option>
          ))}
        </select>
        {user?.role !== "BM" && (
          <select
            className="fa-input text-xs"
            style={{ minWidth: "200px", height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            value={branch}
            onChange={e => setBranch(e.target.value as BranchCode | "all")}
          >
            <option value="all">All branches</option>
            {BRANCHES.map(b => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>
        )}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
          <input
            className="fa-input fa-input-icon-left text-xs"
            style={{ height: "30px", paddingTop: "0.15rem", paddingBottom: "0.15rem" }}
            placeholder="Search student name, ID, or coach…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white border border-ivory-300 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-3 border-b border-ivory-300 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-emerald-900">Reports</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500">{filtered.length} of {reports.length} total</span>
            {filtered.length > 0 && (
              <Link
                href={`/pcm-system/shared/reports/print?ids=${filtered.map(r => encodeURIComponent(r.invitationId)).join(",")}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold shadow-sm
                           bg-gradient-to-r from-violet-600 to-fuchsia-600
                           hover:from-violet-700 hover:to-fuchsia-700 transition-all"
                title="Print every currently-filtered report as one multi-page PDF"
              >
                <PrinterAll className="w-3.5 h-3.5" />
                Print all {filtered.length}
              </Link>
            )}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-400">
            No reports match these filters.
          </div>
        ) : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Branch</th>
                <th>Grade</th>
                <th>Date</th>
                <th>Coach</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const total = r.confidenceScore + r.voiceClarityScore + r.eyeContactScore + r.ideaExpressionScore;
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium text-ink-900">{r.studentName}</div>
                      <div className="text-xs text-ink-400">#{r.studentId}</div>
                    </td>
                    <td>
                      <span
                        className="fa-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold"
                        style={{ letterSpacing: "0.06em" }}
                      >
                        {r.branch}
                      </span>
                    </td>
                    <td className="font-mono text-sm">G{r.grade}</td>
                    {/* Date column shows when the coach filled the form
                        (server-set createdAt). The certificate prints the
                        same value, so both views always agree. */}
                    <td className="font-mono text-xs text-ink-500">
                      {format(parseISO(r.createdAt), "d MMM yyyy")}
                    </td>
                    <td className="text-sm text-ink-700">{r.preparedBy || <span className="text-ink-400 italic">—</span>}</td>
                    <td>
                      <span className="font-mono text-sm font-bold text-emerald-700">{total} <span className="text-ink-400">/ 20</span></span>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/pcm-system/shared/reports/${r.invitationId}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-ivory-300 bg-white text-ink-700 hover:bg-ivory-100"
                          title="Edit report"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </Link>
                        <Link
                          href={`/pcm-system/shared/reports/${r.invitationId}/certificate`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                          title="Print as certificate"
                        >
                          <Printer className="w-3 h-3" /> Print
                        </Link>
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
