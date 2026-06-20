"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { UserRoundCheck, Search, X } from "lucide-react";
import { moveRecruit } from "@/app/recruitment/_actions";

// Stage colour token (rec_stage.color) → static Tailwind dot class.
const DOT: Record<string, string> = {
  slate: "bg-slate-400", zinc: "bg-zinc-400", sky: "bg-sky-400", cyan: "bg-cyan-400",
  indigo: "bg-indigo-400", violet: "bg-violet-400", amber: "bg-amber-400",
  emerald: "bg-emerald-500", teal: "bg-teal-400", rose: "bg-rose-400",
  green: "bg-green-500", lime: "bg-lime-500",
};

interface Card {
  id: string;
  name: string;
  source: string | null;
  position: string | null;
  branch: string | null;
  hired: boolean;
}
interface Column {
  id: string;
  name: string;
  shortCode: string;
  color: string;
  recruits: Card[];
}

const SELECT_CLS =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

export function RecruitmentBoard({ columns: initial }: { columns: Column[] }) {
  const [columns, setColumns] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setColumns(initial), [initial]);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [source, setSource] = useState("");
  const [hiredOnly, setHiredOnly] = useState(false);

  const { branchOpts, sourceOpts } = useMemo(() => {
    const b = new Set<string>(), s = new Set<string>();
    for (const c of columns) for (const r of c.recruits) {
      if (r.branch) b.add(r.branch);
      if (r.source) s.add(r.source);
    }
    return {
      branchOpts: Array.from(b).sort(),
      sourceOpts: Array.from(s).sort(),
    };
  }, [columns]);

  const filterActive = !!(q || branch || source || hiredOnly);
  const match = (r: Card) => {
    if (hiredOnly && !r.hired) return false;
    if (branch && r.branch !== branch) return false;
    if (source && r.source !== source) return false;
    if (q) {
      const s = q.toLowerCase();
      if (![r.name, r.position, r.branch, r.source].some((v) => (v ?? "").toLowerCase().includes(s))) return false;
    }
    return true;
  };
  const displayed = useMemo(
    () => columns.map((c) => ({ ...c, shown: c.recruits.filter(match) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, q, branch, source, hiredOnly],
  );
  const shownTotal = displayed.reduce((s, c) => s + c.shown.length, 0);

  function clearFilters() {
    setQ(""); setBranch(""); setSource(""); setHiredOnly(false);
  }

  // ── Drag → move ────────────────────────────────────────────────────────────
  async function onDragEnd(result: DropResult) {
    const { source: src, destination, draggableId } = result;
    if (!destination || src.droppableId === destination.droppableId) return;

    const prev = columns;
    // Optimistic move (position within a column isn't persisted — recruits are
    // ordered by submission date on reload — so just lift to the top of dest).
    setColumns((cols) => {
      const card = cols.find((c) => c.id === src.droppableId)?.recruits.find((r) => r.id === draggableId);
      if (!card) return cols;
      return cols.map((c) => {
        if (c.id === src.droppableId) return { ...c, recruits: c.recruits.filter((r) => r.id !== draggableId) };
        if (c.id === destination.droppableId) return { ...c, recruits: [card, ...c.recruits] };
        return c;
      });
    });

    const res = await moveRecruit(draggableId, destination.droppableId);
    if (!res.ok) {
      setColumns(prev);
      setError(res.error ?? "Move failed");
      setTimeout(() => setError(null), 4000);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-1 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recruits…"
            className={`${SELECT_CLS} w-52 pl-8`}
          />
        </div>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className={SELECT_CLS} title="Filter by branch">
          <option value="">All branches</option>
          {branchOpts.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={SELECT_CLS} title="Filter by source">
          <option value="">All sources</option>
          {sourceOpts.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <input type="checkbox" checked={hiredOnly} onChange={(e) => setHiredOnly(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
          Hired only
        </label>
        {filterActive && (
          <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{shownTotal} shown</span>
      </div>

      {error && (
        <div className="mx-6 mt-1 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto p-6 pt-3">
          <div className="flex h-full items-stretch gap-3">
            {displayed.map((stage) => (
              <Droppable droppableId={stage.id} key={stage.id}>
                {(provided, snapshot) => (
                  <div className="flex w-72 shrink-0 flex-col rounded-xl border border-emerald-100 bg-emerald-50/40 dark:border-emerald-950/40 dark:bg-emerald-950/10">
                    <div className="flex items-center gap-2 border-b border-emerald-100 px-3 py-2.5 dark:border-emerald-950/40">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[stage.color] ?? "bg-slate-400"}`} />
                      <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-white">{stage.name}</span>
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">{stage.shortCode}</span>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        {filterActive ? `${stage.shown.length}/${stage.recruits.length}` : stage.recruits.length}
                      </span>
                    </div>
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 space-y-2 overflow-y-auto p-2 transition-colors ${snapshot.isDraggingOver ? "bg-emerald-100/50 dark:bg-emerald-900/20" : ""}`}
                      style={{ minHeight: 80 }}
                    >
                      {stage.shown.map((r, i) => (
                        <Draggable draggableId={r.id} index={i} key={r.id}>
                          {(p, snap) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              className={`rounded-lg border bg-white p-2.5 shadow-sm dark:bg-slate-800 ${snap.isDragging ? "border-emerald-400 shadow-md" : "border-slate-200 dark:border-slate-700"}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium leading-tight text-slate-900 dark:text-white">{r.name}</p>
                                {r.hired && (
                                  <span title="Matched to a BranchStaff record (hired)" className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                    <UserRoundCheck className="h-2.5 w-2.5" /> Hired
                                  </span>
                                )}
                              </div>
                              {(r.position || r.source) && (
                                <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{r.position || r.source}</p>
                              )}
                              {r.branch && (
                                <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-300">{r.branch}</span>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
