"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  Search,
  X,
  IdCard,
  Clock,
  CalendarDays,
  Pencil,
  Check,
  Network,
  LayoutGrid,
  History,
} from "lucide-react";
import { saveWorkingHours } from "./actions";

export interface DirectoryPerson {
  id: number;
  userId: number;
  employeeId: string | null;
  name: string;
  email: string;
  phone: string | null;
  position: string;
  branchId: number | null;
  branchName: string | null;
  branchCode: string | null;
  branchLocation: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  joinedYear: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  workingHoursRaw: unknown;
}

export interface DirectoryBranch {
  id: number;
  name: string;
  code: string | null;
  location: string | null;
}

export interface DirectoryDepartment {
  id: number;
  name: string;
  code: string | null;
}

interface DaySchedule {
  start: string;
  end: string;
}
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type WeekSchedule = Record<DayKey, DaySchedule | null>;

const STANDARD_OFFICE: WeekSchedule = {
  Mon: { start: "09:00", end: "18:00" },
  Tue: { start: "09:00", end: "18:00" },
  Wed: { start: "09:00", end: "18:00" },
  Thu: { start: "09:00", end: "18:00" },
  Fri: { start: "09:00", end: "18:00" },
  Sat: null,
  Sun: null,
};

const DAYS_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABEL: Record<DayKey, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const DAY_ALIASES: Record<string, DayKey> = {
  mon: "Mon", monday: "Mon",
  tue: "Tue", tues: "Tue", tuesday: "Tue",
  wed: "Wed", weds: "Wed", wednesday: "Wed",
  thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
  fri: "Fri", friday: "Fri",
  sat: "Sat", saturday: "Sat",
  sun: "Sun", sunday: "Sun",
};

function parseWorkingHours(json: unknown): WeekSchedule {
  if (!json || typeof json !== "object" || Array.isArray(json)) return STANDARD_OFFICE;
  const obj = json as Record<string, unknown>;
  const result: WeekSchedule = { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null };
  let parsedAny = false;

  for (const [rawKey, val] of Object.entries(obj)) {
    const key = DAY_ALIASES[rawKey.toLowerCase()];
    if (!key) continue;
    if (val === null || val === false) {
      result[key] = null;
      parsedAny = true;
      continue;
    }
    if (typeof val === "string") {
      const m = val.match(/^\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$/);
      if (m) { result[key] = { start: m[1].padStart(5, "0"), end: m[2].padStart(5, "0") }; parsedAny = true; }
      continue;
    }
    if (typeof val === "object") {
      const v = val as Record<string, unknown>;
      const start = typeof v.start === "string" ? v.start : (typeof v.from === "string" ? v.from : null);
      const end = typeof v.end === "string" ? v.end : (typeof v.to === "string" ? v.to : null);
      if (start && end) { result[key] = { start, end }; parsedAny = true; }
    }
  }

  return parsedAny ? result : STANDARD_OFFICE;
}

function formatDayMonth(iso: string): string {
  // Parse as local date to avoid TZ shift from UTC midnight ISO strings.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const monthName = date.toLocaleDateString("en-US", { month: "short" });
  return `${date.getDate()} ${monthName}`;
}

function formatDayMonthYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const monthName = date.toLocaleDateString("en-US", { month: "short" });
  return `${date.getDate()} ${monthName} ${y}`;
}

function format12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h24 = Number(hStr);
  const m = mStr ?? "00";
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${m} ${period}`;
}

function totalWeeklyHours(schedule: WeekSchedule): number {
  let total = 0;
  DAYS_ORDER.forEach(d => {
    const slot = schedule[d];
    if (!slot) return;
    const [sh, sm] = slot.start.split(":").map(Number);
    const [eh, em] = slot.end.split(":").map(Number);
    total += (eh + em / 60) - (sh + sm / 60);
  });
  return total;
}

const POSITION_RANK: Record<string, number> = {
  "FT CEO": 0,
  "FT HOD": 1,
  "BM": 1,
  "FT EXEC": 2,
  "FT COACH": 2,
  "PT COACH": 3,
  "INTERN": 4,
};

function positionRank(position: string): number {
  return POSITION_RANK[position.toUpperCase()] ?? 5;
}

type Tier = "Lead" | "Senior" | "Junior";
function tierFromRank(rank: number): Tier {
  if (rank <= 1) return "Lead";
  if (rank <= 2) return "Senior";
  return "Junior";
}

function isHQBranch(b: DirectoryBranch): boolean {
  const code = (b.code ?? "").toUpperCase();
  const name = b.name.toLowerCase();
  return code === "HQ" || name.includes("hq") || name.includes("headquarter");
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(p => /^[A-Za-z]/.test(p));
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TIER_BG: Record<Tier, string> = {
  Lead: "bg-emerald-600",
  Senior: "bg-blue-600",
  Junior: "bg-slate-600",
};

const TIER_BADGE: Record<Tier, string> = {
  Lead: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Senior: "bg-blue-50 text-blue-700 border-blue-200",
  Junior: "bg-slate-100 text-slate-700 border-slate-200",
};

const TIER_AVATAR: Record<Tier, string> = {
  Lead: "bg-gradient-to-br from-emerald-500 to-teal-600",
  Senior: "bg-gradient-to-br from-blue-500 to-indigo-600",
  Junior: "bg-gradient-to-br from-slate-500 to-slate-600",
};

const NODE_W = 188;
const NODE_H = 124;
const GAP_X = 56;
const GAP_Y = 10;
const PAD = 24;
const MAX_CHILDREN_PER_PARENT = 2;

interface Pos { x: number; y: number; depth: number }
interface TreeNode {
  person: DirectoryPerson;
  parentId: number | null;
  children: number[];
}

function sortByStartDate(arr: DirectoryPerson[]): void {
  arr.sort((a, b) => {
    if (a.startDate && b.startDate) {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    } else if (a.startDate) {
      return -1;
    } else if (b.startDate) {
      return 1;
    }
    return a.id - b.id;
  });
}

function distributeRanksWithinGroup(group: DirectoryPerson[], tree: Map<number, TreeNode>): void {
  const byRank = new Map<number, DirectoryPerson[]>();
  group.forEach(p => {
    const r = positionRank(p.position);
    const arr = byRank.get(r);
    if (arr) arr.push(p);
    else byRank.set(r, [p]);
  });
  byRank.forEach(arr => sortByStartDate(arr));

  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  if (ranks.length === 0) return;

  let parentsForNextRank: number[] = (byRank.get(ranks[0]) ?? []).map(p => p.id);

  for (let i = 1; i < ranks.length; i++) {
    const isLeafRank = i === ranks.length - 1;
    const children = byRank.get(ranks[i]) ?? [];
    const previousRankCount = Math.max(1, parentsForNextRank.length);
    const evenSpread = Math.max(1, Math.ceil(children.length / previousRankCount));
    const cap = isLeafRank
      ? evenSpread
      : Math.min(MAX_CHILDREN_PER_PARENT, evenSpread);

    const parentQueue: number[] = [...parentsForNextRank];
    const placedThisRank: number[] = [];

    const findParent = (): number | null => {
      while (parentQueue.length > 0) {
        const candidateId = parentQueue[0];
        const candidate = tree.get(candidateId);
        if (candidate && candidate.children.length < cap) return candidateId;
        parentQueue.shift();
      }
      return null;
    };

    for (const child of children) {
      let parentId = findParent();
      if (parentId === null && !isLeafRank && placedThisRank.length > 0) {
        parentQueue.push(...placedThisRank);
        parentId = findParent();
      }
      if (parentId === null) continue;

      const childNode = tree.get(child.id);
      const parentNode = tree.get(parentId);
      if (childNode && parentNode) {
        childNode.parentId = parentId;
        parentNode.children.push(child.id);
        placedThisRank.push(child.id);
      }
    }

    parentsForNextRank = placedThisRank;
  }
}

function buildTreeByDepartment(scope: DirectoryPerson[]): Map<number, TreeNode> {
  // CEO sits at the top once; each department's HOD attaches directly to the CEO; below each
  // HOD the department's own EXECs / INTERNs follow (cap=2 with leaf no-cap, same as the
  // single-scope tree). Departments render as visually separate subtrees under one shared CEO.
  const tree = new Map<number, TreeNode>();
  scope.forEach(p => tree.set(p.id, { person: p, parentId: null, children: [] }));

  const ceo = scope.find(p => positionRank(p.position) === 0) ?? null;

  const byDept = new Map<number, DirectoryPerson[]>();
  const noDept: DirectoryPerson[] = [];
  scope.forEach(p => {
    if (ceo && p.id === ceo.id) return;
    if (p.departmentId === null) {
      noDept.push(p);
      return;
    }
    const arr = byDept.get(p.departmentId);
    if (arr) arr.push(p);
    else byDept.set(p.departmentId, [p]);
  });

  // Stable order across departments: by department id ascending so the layout is deterministic.
  const orderedDeptIds = [...byDept.keys()].sort((a, b) => a - b);
  orderedDeptIds.forEach(deptId => {
    const deptPeople = byDept.get(deptId)!;
    distributeRanksWithinGroup(deptPeople, tree);
  });
  if (noDept.length > 0) distributeRanksWithinGroup(noDept, tree);

  if (ceo) {
    const ceoNode = tree.get(ceo.id);
    orderedDeptIds.forEach(deptId => {
      byDept.get(deptId)!.forEach(p => {
        const node = tree.get(p.id);
        if (node && node.parentId === null && p.id !== ceo.id) {
          node.parentId = ceo.id;
          ceoNode?.children.push(p.id);
        }
      });
    });
    noDept.forEach(p => {
      const node = tree.get(p.id);
      if (node && node.parentId === null && p.id !== ceo.id) {
        node.parentId = ceo.id;
        ceoNode?.children.push(p.id);
      }
    });
  }

  return tree;
}

function buildTree(scope: DirectoryPerson[]): Map<number, TreeNode> {
  const tree = new Map<number, TreeNode>();
  scope.forEach(p => tree.set(p.id, { person: p, parentId: null, children: [] }));
  distributeRanksWithinGroup(scope, tree);
  return tree;
}

function computeLayout(tree: Map<number, TreeNode>): {
  positions: Map<number, Pos>;
  width: number;
  height: number;
} {
  const positions = new Map<number, Pos>();
  let cursor = 0;
  let maxDepth = 0;

  const roots = [...tree.values()].filter(n => n.parentId === null).map(n => n.person.id);

  const place = (id: number, depth: number): { center: number } => {
    if (depth > maxDepth) maxDepth = depth;
    const node = tree.get(id);
    if (!node) return { center: 0 };
    if (node.children.length === 0) {
      const y = cursor * (NODE_H + GAP_Y);
      cursor++;
      positions.set(id, { x: depth * (NODE_W + GAP_X), y, depth });
      return { center: y };
    }
    const childCenters = node.children.map(c => place(c, depth + 1).center);
    const y = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    positions.set(id, { x: depth * (NODE_W + GAP_X), y, depth });
    return { center: y };
  };

  roots.forEach(id => place(id, 0));

  const width = positions.size === 0
    ? NODE_W + PAD * 2
    : (maxDepth + 1) * (NODE_W + GAP_X) - GAP_X + PAD * 2;
  const height = positions.size === 0
    ? NODE_H + PAD * 2
    : cursor * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;
  return { positions, width, height };
}

const ALL = "all";
const CEO_DEPT_ID = -1;

type ViewMode = "chart" | "card" | "timeline";

export default function StaffDirectory({
  people,
  branches,
  departments,
}: {
  people: DirectoryPerson[];
  branches: DirectoryBranch[];
  departments: DirectoryDepartment[];
}) {
  const hqBranch = useMemo(() => branches.find(isHQBranch) ?? null, [branches]);

  const opsDept = useMemo(
    () => departments.find(d =>
      (d.code ?? "").toUpperCase() === "OPT" ||
      d.name.toLowerCase().includes("operation"),
    ) ?? null,
    [departments],
  );

  void hqBranch;
  void opsDept;

  // Two-step picker: filterType (Branch / Dept) drives which list is shown
  // in the second dropdown. Only one of branchFilter / deptFilter is ever
  // active at a time — switching filterType resets the other.
  const [filterType, setFilterType] = useState<"branch" | "dept">("branch");
  const [branchFilter, setBranchFilter] = useState<number | null>(null);
  const [deptFilter, setDeptFilter] = useState<number | null>(null);
  // Working-hours filter: pick a day to restrict to staff who work that day;
  // optionally add a time (HH:MM) to further restrict to staff whose shift
  // covers that moment. Empty workingDay disables the filter entirely.
  const [workingDay, setWorkingDay] = useState<DayKey | "">("");
  const [workingTime, setWorkingTime] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chart");

  // Show every canonical department in the dropdown, even if it has no staff
  // yet — the list is fixed by company structure, not by data presence.
  const populatedDepartments = departments;

  // Branch/dept scope — applies to every view (chart, card, timeline).
  const branchDeptScope = useMemo(() => {
    return people.filter(p => {
      if (branchFilter !== null && p.branchId !== branchFilter) return false;
      if (deptFilter !== null && p.departmentId !== deptFilter) return false;
      return true;
    });
  }, [people, branchFilter, deptFilter]);

  // Adds the working-hours filter on top. Timeline view bypasses this
  // entirely — historical / departed staff don't have meaningful schedules,
  // so the day/time filter only narrows chart and card views.
  const scope = useMemo(() => {
    if (!workingDay) return branchDeptScope;
    return branchDeptScope.filter(p => {
      const sched = parseWorkingHours(p.workingHoursRaw);
      const slot = sched[workingDay];
      if (!slot) return false;
      // Time filter is inclusive of start, exclusive of end — same
      // convention used by attendance / shift code elsewhere.
      if (workingTime && (workingTime < slot.start || workingTime >= slot.end)) {
        return false;
      }
      return true;
    });
  }, [branchDeptScope, workingDay, workingTime]);

  // Chart and card views only render currently-employed people; timeline includes
  // departures so it can show "Left {year}" events.
  const activeScope = useMemo(() => scope.filter(p => p.isActive), [scope]);

  // When neither filter is active we render each department as its own subtree
  // under one shared CEO root. Once any filter narrows the scope we revert to
  // the flat single-tree layout.
  const isAllDepartmentsView = branchFilter === null && deptFilter === null;
  const tree = useMemo(
    () => (isAllDepartmentsView ? buildTreeByDepartment(activeScope) : buildTree(activeScope)),
    [activeScope, isAllDepartmentsView],
  );
  const layout = useMemo(() => computeLayout(tree), [tree]);

  const trimmedQuery = query.trim().toLowerCase();
  // Match against branchDeptScope (broader set) so timeline search still
  // finds people the working-hours filter would have excluded.
  const matchedIds = useMemo(() => {
    if (!trimmedQuery) return null;
    const set = new Set<number>();
    branchDeptScope.forEach(p => {
      const hay = `${p.name} ${p.position} ${p.email} ${p.departmentName ?? ""}`.toLowerCase();
      if (hay.includes(trimmedQuery)) set.add(p.id);
    });
    return set;
  }, [branchDeptScope, trimmedQuery]);

  // Chart dims non-matches but keeps the tree; flat views just filter. Card uses active-only,
  // timeline includes departed employees so events can show "Left {year}".
  const cardPeople = useMemo(() => {
    if (matchedIds === null) return activeScope;
    return activeScope.filter(p => matchedIds.has(p.id));
  }, [activeScope, matchedIds]);
  const timelinePeople = useMemo(() => {
    // Timeline ignores the working-day/time filter — historical tenure
    // events shouldn't be hidden by a current-schedule check.
    if (matchedIds === null) return branchDeptScope;
    return branchDeptScope.filter(p => matchedIds.has(p.id));
  }, [branchDeptScope, matchedIds]);

  useEffect(() => {
    if (selectedId !== null && !tree.has(selectedId)) setSelectedId(null);
  }, [tree, selectedId]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const onPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== "chart") return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    const container = scrollRef.current;
    if (!container) return;
    dragState.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
    setIsDragging(true);
    container.setPointerCapture(e.pointerId);
  };

  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const container = scrollRef.current;
    if (!container) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.current.moved = true;
    container.scrollLeft = dragState.current.scrollLeft - dx;
    container.scrollTop = dragState.current.scrollTop - dy;
  };

  const onPanEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current.active = false;
    setIsDragging(false);
    const container = scrollRef.current;
    if (container) container.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selected = selectedId !== null ? tree.get(selectedId)?.person ?? null : null;
  const selectedSchedule = useMemo(
    () => selected ? parseWorkingHours(selected.workingHoursRaw) : STANDARD_OFFICE,
    [selected],
  );

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-6 pt-4 pb-10">
        <div className="flex flex-wrap items-center justify-end gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or role…"
                className="bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-56"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors duration-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <FilterSelect
              label="Filter by"
              value={filterType}
              onChange={(v) => {
                const next = v as "branch" | "dept";
                setFilterType(next);
                // Clear the other side's filter so switching modes always
                // starts from "All" — avoids a stale dept filter hiding
                // rows after the user switched to Branch mode.
                if (next === "branch") setDeptFilter(null);
                else setBranchFilter(null);
              }}
              options={[
                { value: "branch", label: "Branch" },
                { value: "dept",   label: "Dept"   },
              ]}
            />

            {filterType === "branch" ? (
              <FilterSelect
                label="Branch"
                value={branchFilter === null ? ALL : String(branchFilter)}
                onChange={(v) => setBranchFilter(v === ALL ? null : Number(v))}
                options={[
                  { value: ALL, label: "All branches" },
                  ...branches.map(b => ({ value: String(b.id), label: b.name })),
                ]}
              />
            ) : (
              <FilterSelect
                label="Department"
                value={deptFilter === null ? ALL : String(deptFilter)}
                onChange={(v) => setDeptFilter(v === ALL ? null : Number(v))}
                options={[
                  { value: ALL, label: "All departments" },
                  ...populatedDepartments.map(d => ({ value: String(d.id), label: d.name })),
                ]}
              />
            )}

            {viewMode !== "timeline" && (
              <>
                <FilterSelect
                  label="Working day"
                  value={workingDay}
                  onChange={(v) => {
                    setWorkingDay(v as DayKey | "");
                    if (v === "") setWorkingTime("");
                  }}
                  options={[
                    { value: "",    label: "Any day" },
                    ...DAYS_ORDER.map(d => ({ value: d, label: DAY_LABEL[d] })),
                  ]}
                />

                {workingDay && (
                  <label className="relative inline-flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent">
                    <span className="text-slate-500 mr-1.5 whitespace-nowrap">At:</span>
                    <input
                      type="time"
                      value={workingTime}
                      onChange={(e) => setWorkingTime(e.target.value)}
                      aria-label="Working time"
                      className="bg-transparent text-slate-900 font-medium tabular-nums focus:outline-none cursor-pointer w-[90px]"
                    />
                    {workingTime && (
                      <button
                        type="button"
                        onClick={() => setWorkingTime("")}
                        aria-label="Clear time"
                        className="ml-1 p-0.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors duration-200 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </label>
                )}
              </>
            )}

            {/* "Clear filters" — appears only when at least one filter is
                non-default. Resets search, branch/dept, and working-hours
                state. The Branch/Dept type toggle is a UI mode, not a
                filter, so it's preserved. */}
            {(query || branchFilter !== null || deptFilter !== null || workingDay) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setBranchFilter(null);
                  setDeptFilter(null);
                  setWorkingDay("");
                  setWorkingTime("");
                }}
                className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-colors duration-200 cursor-pointer"
                aria-label="Clear all filters"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-5">
          <div
            className="flex-1 min-w-0 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
            style={{ minHeight: 600 }}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Meet the team
                </p>
                <h1 className="mt-1 text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
                  Staff Directory
                </h1>
              </div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>

            <div
              ref={scrollRef}
              onPointerDown={onPanStart}
              onPointerMove={onPanMove}
              onPointerUp={onPanEnd}
              onPointerCancel={onPanEnd}
              className={[
                "flex-1 overflow-auto select-none",
                viewMode === "chart" ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "",
              ].join(" ")}
              style={{ touchAction: viewMode === "chart" ? "none" : "auto" }}
            >
            {(viewMode === "timeline" ? branchDeptScope : scope).length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                No employees in this scope.
              </div>
            ) : viewMode !== "timeline" && activeScope.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                No active employees in this scope. Switch to <span className="font-medium text-slate-700">Timeline</span> to see departed staff.
              </div>
            ) : viewMode === "chart" ? (
              <div className="relative" style={{ width: layout.width, height: layout.height }}>
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={layout.width}
                  height={layout.height}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient
                      id="edge-gradient"
                      gradientUnits="userSpaceOnUse"
                      x1="0"
                      y1="0"
                      x2={layout.width}
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
                    </linearGradient>
                    <linearGradient
                      id="edge-gradient-active"
                      gradientUnits="userSpaceOnUse"
                      x1="0"
                      y1="0"
                      x2={layout.width}
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#10b981" stopOpacity="1" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="1" />
                    </linearGradient>
                  </defs>
                  {[...tree.values()].map(node => {
                    if (node.parentId === null) return null;
                    const a = layout.positions.get(node.parentId);
                    const b = layout.positions.get(node.person.id);
                    if (!a || !b) return null;
                    const x1 = a.x + NODE_W + PAD;
                    const y1 = a.y + NODE_H / 2 + PAD;
                    const x2 = b.x + PAD;
                    const y2 = b.y + NODE_H / 2 + PAD;
                    const mx = (x1 + x2) / 2;
                    const isActive =
                      selectedId !== null &&
                      (selectedId === node.person.id || selectedId === node.parentId);
                    const dim = matchedIds !== null && !matchedIds.has(node.person.id) && !matchedIds.has(node.parentId);
                    return (
                      <path
                        key={`edge-${node.person.id}`}
                        d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke={isActive ? "url(#edge-gradient-active)" : "url(#edge-gradient)"}
                        strokeWidth={isActive ? 2.5 : 1.5}
                        opacity={dim ? 0.2 : 1}
                        className="transition-all duration-300"
                      />
                    );
                  })}
                </svg>

                {[...tree.values()].map(node => {
                  const p = node.person;
                  const pos = layout.positions.get(p.id);
                  if (!pos) return null;
                  const left = pos.x + PAD;
                  const top = pos.y + PAD;
                  const active = selectedId === p.id;
                  const hovered = hoveredId === p.id;
                  const matched = matchedIds !== null && matchedIds.has(p.id);
                  const dimmed = matchedIds !== null && !matchedIds.has(p.id);
                  const tier = tierFromRank(positionRank(p.position));
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (dragState.current.moved) return;
                        setSelectedId(p.id === selectedId ? null : p.id);
                      }}
                      onMouseEnter={() => setHoveredId(p.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setHoveredId(p.id)}
                      onBlur={() => setHoveredId(null)}
                      aria-current={active ? "true" : undefined}
                      title={`${p.name} — ${p.position}`}
                      className={[
                        "absolute group flex flex-col items-center gap-2 p-3 rounded-2xl bg-white transition-all duration-300 cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                        active
                          ? "border-2 border-emerald-500 shadow-xl scale-[1.04] z-20"
                          : matched
                            ? "border-2 border-amber-400 shadow-md scale-[1.02] z-10"
                            : hovered
                              ? "border border-slate-200 shadow-lg scale-[1.03] z-10"
                              : "border border-slate-200 hover:shadow-md z-0",
                        dimmed ? "opacity-30" : "opacity-100",
                      ].join(" ")}
                      style={{ left, top, width: NODE_W, height: NODE_H }}
                    >
                      <div className={`relative ${TIER_AVATAR[tier]} w-14 h-14 rounded-full flex items-center justify-center text-white font-semibold shadow-md ring-4 ring-white`}>
                        <span className="text-base">{initials(p.name)}</span>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${TIER_BG[tier]} ring-2 ring-white`} aria-hidden="true" />
                      </div>
                      <p className="text-[13px] font-semibold text-slate-900 leading-tight text-center line-clamp-1 w-full px-1">
                        {p.name}
                      </p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TIER_BADGE[tier]} truncate max-w-full`}>
                        {p.position}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : viewMode === "card" ? (
              <CardGridView
                people={cardPeople}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
              />
            ) : (
              <TimelineView
                people={timelinePeople}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
              />
            )}
            </div>
          </div>

          <aside
            className={[
              "shrink-0 transition-all duration-500 ease-out",
              selected ? "w-[300px] opacity-100" : "w-0 opacity-0 pointer-events-none",
            ].join(" ")}
            aria-hidden={!selected}
          >
            {selected && (
              <div key={selected.id} className="flex flex-col gap-4">
                {viewMode === "card" ? (
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Selected
                      </p>
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {selected.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      aria-label="Clear selection"
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors duration-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <IDCard
                    person={selected}
                    onClose={() => setSelectedId(null)}
                  />
                )}
                <WorkingHoursCard
                  employmentId={selected.id}
                  schedule={selectedSchedule}
                />
              </div>
            )}
          </aside>
        </div>

        {!selected && viewMode === "chart" && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Click any team member to see their profile.
          </p>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative inline-flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent">
      <span className="text-slate-500 mr-1.5 whitespace-nowrap">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none bg-transparent text-slate-900 font-medium pr-5 focus:outline-none cursor-pointer max-w-[170px]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
    </label>
  );
}

function IDCard({
  person,
  onClose,
}: {
  person: DirectoryPerson;
  onClose?: () => void;
}) {
  const tier = tierFromRank(positionRank(person.position));
  const isLead = tier === "Lead";
  const sidebarColor = isLead ? "bg-emerald-600" : "bg-rose-600";
  const accentColor = isLead ? "text-emerald-600" : "text-rose-600";
  const photoBorder = isLead ? "border-emerald-600" : "border-rose-600";

  const idLabel = person.employeeId ?? `EB-${String(person.id).padStart(5, "0")}`;
  const idDigits = idLabel.replace(/[^0-9]/g, "").padStart(8, "0");

  return (
    <div
      className="relative bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-[slideIn_0.45s_cubic-bezier(0.22,1,0.36,1)]"
      style={{ width: 300, minHeight: 460 }}
    >
      <style jsx>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .grid-bg {
          background-image:
            linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px);
          background-size: 18px 18px;
        }
      `}</style>

      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close profile"
          className="absolute top-2.5 right-12 z-20 p-1.5 rounded-md bg-white/80 backdrop-blur text-slate-500 hover:text-slate-900 hover:bg-white transition-colors duration-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className={`absolute top-0 right-0 bottom-0 w-9 ${sidebarColor} flex items-center justify-center z-10`}>
        <span
          className="text-white font-bold text-xs tracking-[0.3em] uppercase whitespace-nowrap"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {person.position}
        </span>
      </div>

      <div className="grid-bg pt-5 pr-12 pl-5 pb-5">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-7 h-7 rounded-md ${sidebarColor} flex items-center justify-center text-white`}>
            <IdCard className="w-4 h-4" aria-hidden="true" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700 leading-tight">
            Ebright<br />
            <span className="text-slate-500 font-medium">Staff Card</span>
          </p>
        </div>

        <div className={`relative w-[150px] h-[170px] mx-auto mb-4 border-[3px] ${photoBorder} bg-slate-100 overflow-hidden flex items-center justify-center`}>
          <div className={`${TIER_AVATAR[tier]} w-full h-full flex items-center justify-center text-white font-bold text-5xl`}>
            {initials(person.name)}
          </div>
        </div>

        <h2 className={`text-xl font-bold ${accentColor} text-center leading-tight`}>
          {person.name}
        </h2>

        <div className="mt-4 space-y-1.5 text-[11px]">
          <InfoRow label="ID No" value={idLabel} />
          <InfoRow label="Email" value={person.email} mono />
          {person.phone && <InfoRow label="Phone" value={person.phone} />}
          {person.branchName && <InfoRow label="Branch" value={person.branchName} />}
          {person.departmentName && <InfoRow label="Dept" value={person.departmentName} />}
          {person.joinedYear !== null && <InfoRow label="Joined" value={String(person.joinedYear)} />}
        </div>

        <div className="mt-5 flex items-end gap-1 h-7" aria-hidden="true">
          {Array.from({ length: 36 }).map((_, i) => {
            const seed = (person.id * 7 + i * 13) % 4;
            const w = seed === 0 ? 1 : seed === 1 ? 2 : seed === 2 ? 1 : 3;
            return (
              <span
                key={i}
                className="bg-slate-900"
                style={{ width: w, height: i % 7 === 0 ? 22 : 28 }}
              />
            );
          })}
        </div>
        <p className="mt-1 text-center text-[9px] tracking-[0.2em] text-slate-400 font-mono">
          {idDigits}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="font-bold text-slate-900 w-12 shrink-0 uppercase tracking-wide">{label}</span>
      <span className="text-slate-500">:</span>
      <span className={`text-slate-700 truncate ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function WorkingHoursCard({
  employmentId,
  schedule,
}: {
  employmentId: number;
  schedule: WeekSchedule;
}) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "short" }) as DayKey;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WeekSchedule>(schedule);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Reset draft when a different person is selected (or schedule changes after save)
  useEffect(() => {
    setDraft(schedule);
    setEditing(false);
    setError(null);
  }, [schedule, employmentId]);

  const totalHours = totalWeeklyHours(draft);

  const updateDay = (day: DayKey, slot: DaySchedule | null) => {
    setDraft(prev => ({ ...prev, [day]: slot }));
  };

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const res = await saveWorkingHours(employmentId, draft);
      if (res.ok) {
        setEditing(false);
      } else {
        setError(res.error ?? "Failed to save.");
      }
    });
  };

  const handleCancel = () => {
    setDraft(schedule);
    setEditing(false);
    setError(null);
  };

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-[slideInLater_0.55s_cubic-bezier(0.22,1,0.36,1)]"
      style={{ width: 300 }}
    >
      <style jsx>{`
        @keyframes slideInLater {
          0% { opacity: 0; transform: translateY(12px); }
          25% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <Clock className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 leading-tight">
              Working Hours
            </p>
            <p className="text-xs text-slate-700 font-medium">
              {totalHours.toFixed(0)} hrs / week
            </p>
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit working hours"
              className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                aria-label="Cancel editing"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                aria-label="Save working hours"
                className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-100 text-[11px] text-rose-700">
          {error}
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {DAYS_ORDER.map(d => {
          const slot = draft[d];
          const isToday = d === today;
          const isOff = slot === null;
          return (
            <li
              key={d}
              className={[
                "flex items-center gap-3 px-4 py-2.5",
                isToday && !editing ? "bg-emerald-50/40" : "",
              ].join(" ")}
            >
              <div className={[
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                isOff
                  ? "bg-slate-100 text-slate-400"
                  : isToday
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600",
              ].join(" ")}>
                <CalendarDays className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={[
                    "text-xs font-semibold leading-tight",
                    isOff ? "text-slate-400" : "text-slate-900",
                  ].join(" ")}>
                    {DAY_LABEL[d]}
                    {isToday && !editing && (
                      <span className="ml-1.5 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Today</span>
                    )}
                  </p>
                  {editing && (
                    <label className="inline-flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isOff}
                        onChange={(e) => {
                          updateDay(d, e.target.checked ? null : { start: "09:00", end: "18:00" });
                        }}
                        className="w-3 h-3 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      Off
                    </label>
                  )}
                </div>
                {editing ? (
                  isOff ? (
                    <p className="text-[11px] mt-0.5 text-slate-400 italic">Day off</p>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateDay(d, { ...slot, start: e.target.value })}
                        className="bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[11px] text-slate-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent w-[88px]"
                      />
                      <span className="text-slate-400 text-[11px]">–</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateDay(d, { ...slot, end: e.target.value })}
                        className="bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[11px] text-slate-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent w-[88px]"
                      />
                    </div>
                  )
                ) : (
                  <p className={[
                    "text-[11px] mt-0.5",
                    isOff ? "text-slate-400 italic" : "text-slate-600 tabular-nums",
                  ].join(" ")}>
                    {isOff ? "Day off" : `${format12h(slot.start)} – ${format12h(slot.end)}`}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const options = [
    { value: "chart" as const, label: "Chart", Icon: Network },
    { value: "card" as const, label: "Card", Icon: LayoutGrid },
    { value: "timeline" as const, label: "Timeline", Icon: History },
  ];
  return (
    <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 shrink-0" role="tablist" aria-label="View mode">
      {options.map(o => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer",
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900",
            ].join(" ")}
          >
            <o.Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CardGridView({
  people,
  selectedId,
  onSelect,
}: {
  people: DirectoryPerson[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (people.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-slate-500">
        No team members match this search.
      </div>
    );
  }
  // Sort by hierarchy then by start date — same ordering used by chart's leaf rank.
  const sorted = [...people].sort((a, b) => {
    const ra = positionRank(a.position);
    const rb = positionRank(b.position);
    if (ra !== rb) return ra - rb;
    if (a.startDate && b.startDate) return a.startDate.localeCompare(b.startDate);
    if (a.startDate) return -1;
    if (b.startDate) return 1;
    return a.id - b.id;
  });
  return (
    <div
      className="px-6 py-6 grid gap-5 justify-center"
      style={{ gridTemplateColumns: "repeat(auto-fill, 300px)" }}
    >
      {sorted.map(p => {
        const active = selectedId === p.id;
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(p.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            className={[
              "rounded-2xl transition-all duration-300 cursor-pointer outline-none",
              "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              active
                ? "ring-2 ring-emerald-500 ring-offset-2 scale-[1.02]"
                : "hover:scale-[1.01]",
            ].join(" ")}
          >
            <IDCard person={p} />
          </div>
        );
      })}
    </div>
  );
}

function TimelineView({
  people,
  selectedId,
  onSelect,
}: {
  people: DirectoryPerson[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, DirectoryPerson[]>();
    people.forEach(p => {
      const startYear = p.startDate
        ? new Date(p.startDate).getFullYear()
        : p.joinedYear;
      const yearKey = startYear !== null && startYear !== undefined ? String(startYear) : "Unknown";
      const arr = map.get(yearKey);
      if (arr) arr.push(p);
      else map.set(yearKey, [p]);
    });
    map.forEach(arr => {
      arr.sort((a, b) => {
        if (a.startDate && b.startDate) return a.startDate.localeCompare(b.startDate);
        if (a.startDate) return -1;
        if (b.startDate) return 1;
        const ra = positionRank(a.position);
        const rb = positionRank(b.position);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    });
    return map;
  }, [people]);

  const yearKeys = useMemo(
    () => [...grouped.keys()].sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return Number(a) - Number(b);
    }),
    [grouped],
  );

  if (yearKeys.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-slate-500">
        No team members in this scope.
      </div>
    );
  }

  return (
    <div className="relative px-6 py-6">
      {/* Vertical rail. Width 2px so its center sits on x=89, matching the dot center. */}
      <div className="absolute top-8 bottom-8 left-[88px] w-0.5 bg-slate-200" aria-hidden="true" />
      <div className="flex flex-col gap-8">
        {yearKeys.map(year => {
          const peopleOfYear = grouped.get(year)!;
          return (
            <div key={year} className="relative flex items-start gap-6">
              <div className="w-16 shrink-0 pt-1.5 text-right">
                <span className="text-xl font-semibold text-slate-900 tabular-nums">
                  {year}
                </span>
              </div>
              {/* Dot at left=84,w=10 → center x=89; top tuned to match year text vertical center. */}
              <div
                className="absolute top-[15px] left-[84px] w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50 z-10"
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0 pl-6 flex flex-wrap gap-2.5">
                {peopleOfYear.map(p => (
                  <PersonTenureChip
                    key={p.id}
                    person={p}
                    active={selectedId === p.id}
                    onClick={() => onSelect(p.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonTenureChip({
  person,
  active,
  onClick,
}: {
  person: DirectoryPerson;
  active: boolean;
  onClick: () => void;
}) {
  const tier = tierFromRank(positionRank(person.position));
  const isDeparted = !person.isActive;

  const startYear = person.startDate
    ? new Date(person.startDate).getFullYear()
    : person.joinedYear;
  const endYear = person.endDate
    ? new Date(person.endDate).getFullYear()
    : null;

  let tenureLabel: string;
  if (isDeparted) {
    if (person.startDate && person.endDate) {
      // Both precise dates known → use "6 Jan – 6 May" (same year) or full year (cross-year).
      tenureLabel = startYear === endYear
        ? `${formatDayMonth(person.startDate)} – ${formatDayMonth(person.endDate)}`
        : `${formatDayMonthYear(person.startDate)} – ${formatDayMonthYear(person.endDate)}`;
    } else if (endYear !== null && startYear !== null) {
      tenureLabel = startYear === endYear ? `${startYear}` : `${startYear} – ${endYear}`;
    } else if (endYear !== null) {
      tenureLabel = `Left ${endYear}`;
    } else {
      tenureLabel = "Departed";
    }
  } else {
    tenureLabel = startYear !== null ? `${startYear} – Present` : "Present";
  }

  const titleSuffix = isDeparted
    ? `Departed (${tenureLabel})`
    : `Active since ${startYear ?? "—"}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${person.name} — ${person.position} — ${titleSuffix}`}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-2.5 border rounded-xl pl-2 pr-2.5 py-2 transition-all duration-200 cursor-pointer min-w-0 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        active
          ? "bg-white border-emerald-500 shadow-md scale-[1.02]"
          : isDeparted
            ? "bg-rose-50 border-rose-300 hover:border-rose-400 hover:shadow-md"
            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-md",
      ].join(" ")}
    >
      <div
        className={[
          `${TIER_AVATAR[tier]} w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0`,
          isDeparted ? "opacity-50 grayscale" : "",
        ].join(" ")}
      >
        {initials(person.name)}
      </div>
      <div className="min-w-0">
        <p
          className={[
            "text-xs font-semibold truncate max-w-[140px]",
            isDeparted ? "text-rose-900" : "text-slate-900",
          ].join(" ")}
        >
          {person.name}
        </p>
        <p
          className={[
            "text-[10px] truncate max-w-[140px]",
            isDeparted ? "text-rose-700/80" : "text-slate-500",
          ].join(" ")}
        >
          {person.position}
        </p>
      </div>
      <span
        className={[
          "shrink-0 ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide border tabular-nums",
          isDeparted
            ? "bg-rose-600 text-white border-rose-700"
            : "bg-emerald-50 text-emerald-700 border-emerald-200",
        ].join(" ")}
      >
        {tenureLabel}
      </span>
    </button>
  );
}
