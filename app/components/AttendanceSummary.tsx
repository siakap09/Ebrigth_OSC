"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";

import { Users, UserCheck, LogOut, UserX, ArrowLeft, MapPin, RotateCcw, WifiOff, Loader2, ChevronDown, RefreshCw, CheckCircle2, AlertCircle, Clock, AlertTriangle, Info, Database, Search, X, ArrowUpDown, Wrench, ChevronRight, Calendar } from "lucide-react";
import { motion } from "framer-motion";

import Sidebar from "./Sidebar";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./ui/Tooltip";
import StatCard from "./ui/StatCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  name: string;     // full name from CSV e.g. "KEVIN KHOO"
  dept: string;
  position: string;
  eid: string;
  scannerRef: string; // derived from EID last col: parts[1]+parts[0].slice(0,2)+parts[2] e.g. "22030001"
}

interface RawScanEvent {
  employeeNoString: string;
  time: string;
}

interface AttendanceRecord {
  // Keyed by employeeNoString so each person has exactly one row per day
  empNo: string;
  name: string;
  dept: string;
  position: string;
  checkInTime: Date;
  checkInStr: string;
  checkInStatus: "On Time" | "Late";
  checkOutTime: Date | null;
  checkOutStr: string | null;
  checkOutStatus: "Normal" | "Left Early" | null;
  scanCount: number; // total scans from device today
  scannerLocation: string | null;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cols.push(current.trim());
  return cols.map((col) => col.replace(/^"|"$/g, ""));
}

function parseCSV(text: string): Employee[] {
  const lines = text.trim().split("\n");
  // Row 0 = blank/meta, Row 1 = headers — skip both
  return lines
    .slice(2)
    .map((line) => {
      const cols = parseCSVLine(line);
      if (cols.length < 4) return null;
      const eid = cols[8] ?? ""; // col 8 is the EID (e.g. "0800 44 0014"), col 10 is email
      const parts = eid.trim().split(" ");
      const scannerRef = parts.length === 3 ? parts[1] + parts[0].substring(0, 2) + parts[2] : "";
      return {
        name: cols[0] ?? "",
        dept: cols[1] ?? "",
        position: cols[3] ?? "",
        eid,
        scannerRef,
      } as Employee;
    })
    .filter((e): e is Employee => !!e && e.name !== "");
}

// ─── Status helpers ────────────────────────────────────────────────────────────

function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s ?? 0);
}

function getCheckInStatus(timeStr: string): "On Time" | "Late" {
  return timeToSeconds(timeStr) <= timeToSeconds("09:00:00") ? "On Time" : "Late";
}

function getCheckOutStatus(timeStr: string, isSaturday: boolean): "Normal" | "Left Early" {
  const threshold = isSaturday ? "19:00:00" : "18:00:00";
  return timeToSeconds(timeStr) >= timeToSeconds(threshold) ? "Normal" : "Left Early";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-MY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Core logic: build one row per employee from raw scan events ───────────────
//
// Rules:
//   • 1st scan (chronologically) = Check In — NEVER overwritten
//   • 2nd scan onward = Check Out, always updating to the LATEST scan time
//     (so an accidental early scan gets corrected by the real departure scan)

function buildAttendanceLogs(
  rawEvents: RawScanEvent[],
  employees: Employee[]
): AttendanceRecord[] {
  // Group events by employeeNoString
  const groups = new Map<string, Date[]>();
  for (const event of rawEvents) {
    const t = new Date(event.time);
    if (isNaN(t.getTime())) continue;
    if (!groups.has(event.employeeNoString)) groups.set(event.employeeNoString, []);
    groups.get(event.employeeNoString)!.push(t);
  }

  const records: AttendanceRecord[] = [];

  for (const [empNo, times] of groups) {
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const hasCheckOut = sorted.length > 1;

    const checkInStr = formatTime(first);
    const checkOutStr = hasCheckOut ? formatTime(last) : null;

    // Look up employee directly by scannerRef derived from CSV EID column
    const emp = employees.find((e) => e.scannerRef === empNo);
    const isSaturday = first.getDay() === 6;

    records.push({
      empNo,
      name: emp?.name ?? "Unknown",
      dept: emp?.dept ?? "—",
      position: emp?.position ?? "—",
      checkInTime: first,
      checkInStr,
      checkInStatus: getCheckInStatus(checkInStr),
      checkOutTime: hasCheckOut ? last : null,
      checkOutStr,
      checkOutStatus: checkOutStr ? getCheckOutStatus(checkOutStr, isSaturday) : null,
      scanCount: sorted.length,
      scannerLocation: null,
    });
  }

  // Sort: most recent check-in first
  return records.sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// YYYY-MM-DD in Kuala Lumpur — matches the DB date column and <input type="date"> value.
function todayKLStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

// Pretty label for the date selector ("Mon, 27 Apr 2026")
function prettyDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-MY", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface BranchStaffMember {
  id: number;
  name: string | null;
  nickname: string | null;
  employeeId: string | null;
  branch: string | null;
  department: string | null;
  role: string | null;
  email: string | null;
  status: string | null;
  location: string | null;
}

export default function AttendanceSummary() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "ok" | "error">("idle");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [seenScannerIds, setSeenScannerIds] = useState<string[]>([]);

  // ── Branch / Location filter ───────────────────────────────────────────────
  const [locations, setLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("HQ");
  const [branchStaff, setBranchStaff] = useState<BranchStaffMember[]>([]);
  // Full BranchStaff list (all locations, active only) — used to resolve
  // name + dept + role for any scanner empNo, even when the employee is
  // registered to a different branch than the one being viewed.
  const [allBranchStaff, setAllBranchStaff] = useState<BranchStaffMember[]>([]);

  // ── Date picker (defaults to today KL; auto-refresh only runs when on today) ──
  const [selectedDate, setSelectedDate] = useState<string>(todayKLStr());
  const isViewingToday = selectedDate === todayKLStr();

  // ── Search + sort ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "checkIn" | "dept" | null>("checkIn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: "name" | "checkIn" | "dept") => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Stable ref so the polling interval always sees the latest employees
  const employeesRef = useRef<Employee[]>([]);
  useEffect(() => { employeesRef.current = employees; }, [employees]);

  // Same trick for BranchStaff — canonical source of full name + dept + role.
  // The scanner emits an 8-digit empNo that matches BranchStaff.employeeId.
  // We mirror the *all-locations* list so a person who scans at HQ but is
  // registered to RBY still resolves to their canonical record.
  const branchStaffRef = useRef<BranchStaffMember[]>([]);
  useEffect(() => { branchStaffRef.current = allBranchStaff; }, [allBranchStaff]);

  // Track current date for midnight auto-reset
  const currentDateRef = useRef<string>(getTodayStr());

  // ── Load employee CSV ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/employees.csv")
      .then((r) => r.text())
      .then((text) => setEmployees(parseCSV(text)))
      .catch(() => console.error("Failed to load employees.csv"));
  }, []);

  // ── Load distinct locations ────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/branch-locations")
      .then(r => r.json())
      .then(d => setLocations(d.locations ?? []))
      .catch(() => console.error("Failed to load locations"));
  }, []);

  // ── Load staff for selected location (drives the "Missing Today" panel) ──
  const loadBranchStaff = useCallback(() => {
    if (!selectedLocation) return;
    fetch(`/api/branch-locations?location=${encodeURIComponent(selectedLocation)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} (${r.statusText})`);
        return r.json();
      })
      .then(d => setBranchStaff(d.staff ?? []))
      .catch(err => console.error("Failed to load branch staff:", err));
  }, [selectedLocation]);

  // ── Load full active staff list (drives the row-level name + dept + role
  //    lookup so anyone who scans here resolves correctly, not just locals)
  const loadAllBranchStaff = useCallback(() => {
    fetch(`/api/branch-locations?location=all`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} (${r.statusText})`);
        return r.json();
      })
      .then(d => setAllBranchStaff(d.staff ?? []))
      .catch(err => console.error("Failed to load all branch staff:", err));
  }, []);

  useEffect(() => { loadBranchStaff(); }, [loadBranchStaff]);
  useEffect(() => { loadAllBranchStaff(); }, [loadAllBranchStaff]);

  // Re-pull both staff lists every 30s so HR edits (new thumbprint, name
  // change, role swap, etc.) flow through to the attendance page without a
  // page reload or a code deploy. Polling is light — one query each, active
  // rows only.
  useEffect(() => {
    const id = setInterval(() => {
      loadBranchStaff();
      loadAllBranchStaff();
    }, 30000);
    return () => clearInterval(id);
  }, [loadBranchStaff, loadAllBranchStaff]);

  // ── Poll /api/attendance-today every 5 seconds (reads from DB, written by office sync script) ──
  const fetchScans = useCallback(async () => {
    // ── Midnight auto-reset (only matters when user is on "today") ───────────
    const todayStr = getTodayStr();
    if (todayStr !== currentDateRef.current) {
      currentDateRef.current = todayStr;
      setLogs([]);
      setSeenScannerIds([]);
      setRawCount(null);
      // If user was viewing "today", auto-advance to the new today.
      if (selectedDate !== todayKLStr()) setSelectedDate(todayKLStr());
    }

    try {
      const res = await fetch(`/api/attendance-today?date=${encodeURIComponent(selectedDate)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dbRows: { date: string; empNo: string; empName: string; clockInTime: string; clockOutTime: string | null; scannerLocation: string | null }[] = await res.json();

      setRawCount(dbRows.length);

      // Build AttendanceRecord from DB rows.
      //
      // Canonical source: BranchStaff.employeeId === row.empNo (the scanner
      // emits 8-digit empNo and BranchStaff.employeeId stores the same form).
      // We render whatever the HR records say so the attendance page stays in
      // sync with the HR Employee Management page — no CSV in the loop.
      //
      // Dept column shows BranchStaff.branch (the short code like OD / FNC /
      // HR) to match what HR Employee Management displays under "Branch/Dept".
      // Falls back to .department only if branch is missing.
      const records: AttendanceRecord[] = dbRows.map(row => {
        const staff = branchStaffRef.current.find(s => s.employeeId === row.empNo);
        const checkInDate = new Date(`${row.date}T${row.clockInTime}`);
        const checkOutDate = row.clockOutTime ? new Date(`${row.date}T${row.clockOutTime}`) : null;
        const isSaturday = new Date().getDay() === 6;
        return {
          empNo: row.empNo,
          name: staff?.name ?? row.empName ?? "Unknown",
          dept: staff?.branch ?? staff?.department ?? "—",
          position: staff?.role ?? "—",
          checkInTime: checkInDate,
          checkInStr: row.clockInTime,
          checkInStatus: getCheckInStatus(row.clockInTime),
          checkOutTime: checkOutDate,
          checkOutStr: row.clockOutTime ?? null,
          checkOutStatus: row.clockOutTime ? getCheckOutStatus(row.clockOutTime, isSaturday) : null,
          scanCount: row.clockOutTime ? 2 : 1,
          scannerLocation: row.scannerLocation,
        };
      });

      const ids = dbRows.map(r => r.empNo).filter(Boolean);
      setSeenScannerIds(ids);
      setLogs(records);
      setScannerStatus("ok");
      setLastUpdated(formatTime(new Date()));
    } catch {
      setScannerStatus("error");
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchScans();
    // Only poll for live updates when viewing today — historical dates don't change.
    if (!isViewingToday) return;
    const interval = setInterval(fetchScans, 5000);
    return () => clearInterval(interval);
  }, [fetchScans, isViewingToday]);

  // ── Manual end-of-day reset ────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (!window.confirm("Clear the displayed attendance records? The scanner's own data is unaffected.")) return;
    setLogs([]);
    setSeenScannerIds([]);
    setRawCount(null);
  }, []);

  // ── Filter logs to the selected branch ────────────────────────────────────
  // Show records where the scanner that recorded them is tagged to this location.
  // Null scannerLocation = pre-migration rows → always show under HQ tab.
  const branchFilteredLogs = logs.filter(r =>
    r.scannerLocation === selectedLocation ||
    (selectedLocation === 'HQ' && (r.scannerLocation === null || r.scannerLocation === 'HQ'))
  );

  const visibleLogs = branchFilteredLogs
    .filter(r => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return r.name.toLowerCase().includes(q)
          || r.empNo.toLowerCase().includes(q)
          || r.dept.toLowerCase().includes(q)
          || r.position.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name")    return a.name.localeCompare(b.name) * dir;
      if (sortKey === "dept")    return a.dept.localeCompare(b.dept) * dir;
      if (sortKey === "checkIn") return (a.checkInTime.getTime() - b.checkInTime.getTime()) * dir;
      return 0;
    });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const checkedInCount = branchFilteredLogs.filter((r) => r.checkOutStr === null).length;
  const checkedOutCount = branchFilteredLogs.filter((r) => r.checkOutStr !== null).length;

  // Missing = BranchStaff at selected location who didn't show up in today's scans.
  // Match strategy:
  //   1) Primary: exact empNo match against BranchStaff.employeeId — stable, reliable.
  //   2) Fallback: case-insensitive substring match on names — used only when the
  //      BranchStaff record's employeeId hasn't been mapped to scanner format yet.
  //      Empty / very short scanned names are filtered out so they can't match every
  //      staff record (".includes('')" is always true and would zero the list).
  const scannedEmpNos = new Set(
    branchFilteredLogs.map(r => r.empNo).filter(Boolean)
  );
  const scannedNames = branchFilteredLogs
    .map(r => (r.name ?? '').toUpperCase().trim())
    .filter(n => n.length >= 3); // ignore empty / 1–2 char tokens

  const missingEmployees = branchStaff.filter(s => {
    if (!s.name) return false;
    if (s.status !== 'Active') return false;   // hide Inactive / Archived / null
    if (s.employeeId && scannedEmpNos.has(s.employeeId)) return false; // exact-ID hit
    const fullName = s.name.toUpperCase();
    return !scannedNames.some(sn => fullName.includes(sn) || sn.includes(fullName));
  });

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/30">
      <TooltipProvider delayDuration={150}>
      <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

      <div className="flex-1 flex flex-col">
        {/* ── Header ── */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4">
            {/* Row 1 — back / title / status */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Attendance Dashboard</h1>
                <p className="text-sm text-gray-500 mt-0.5">Live scanner sync · Auto-refreshes every 5 seconds</p>
              </div>

              <div className="ml-auto">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  scannerStatus === "ok"    ? "bg-green-50 text-green-700 border-green-200" :
                  scannerStatus === "error" ? "bg-red-50 text-red-700 border-red-200" :
                                               "bg-gray-50 text-gray-600 border-gray-200"
                }`}>
                  {scannerStatus === "ok" ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                      Scanner Connected
                    </>
                  ) : scannerStatus === "error" ? (
                    <>
                      <WifiOff className="w-3.5 h-3.5" />
                      Scanner Offline
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting…
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2 — branch dropdown + date picker / reset */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow transition-all cursor-pointer group">
                  <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</span>
                  <select
                    value={selectedLocation}
                    onChange={e => setSelectedLocation(e.target.value)}
                    className="text-sm font-semibold text-gray-900 bg-transparent focus:outline-none cursor-pointer pr-1 appearance-none"
                  >
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                </label>

                <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow transition-all cursor-pointer group">
                  <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    max={todayKLStr()}
                    onChange={e => setSelectedDate(e.target.value || todayKLStr())}
                    className="text-sm font-semibold text-gray-900 bg-transparent focus:outline-none cursor-pointer"
                  />
                  {isViewingToday && (
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Today</span>
                  )}
                </label>

                {!isViewingToday && (
                  <button
                    onClick={() => setSelectedDate(todayKLStr())}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Jump to today
                  </button>
                )}
              </div>

              {isViewingToday && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-red-200 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 hover:border-red-300 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  End of Day Reset
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8 w-full">
          {/* ── Stat Cards ── */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <StatCard
              label="Employees Scanned"
              value={branchFilteredLogs.length}
              icon={Users}
              tone="blue"
              tooltip={`Total unique employees who have scanned in at ${selectedLocation} today.`}
            />
            <StatCard
              label="Currently In"
              value={checkedInCount}
              icon={UserCheck}
              tone="green"
              tooltip="Employees who have scanned in but not yet scanned out."
            />
            <StatCard
              label="Checked Out"
              value={checkedOutCount}
              icon={LogOut}
              tone="orange"
              tooltip="Employees who have completed at least one scan-out today."
            />
            <StatCard
              label="Missing"
              value={missingEmployees.length}
              icon={UserX}
              tone="red"
              subtitle={`of ${branchStaff.filter(s => s.status === 'Active').length} active`}
              tooltip={`Active staff registered to ${selectedLocation} who haven't scanned today.`}
            />
          </motion.div>

          {/* ── Info Banner ── */}
          <motion.div
            className="mb-6 px-4 py-3 bg-white border border-gray-200 rounded-xl flex items-center gap-3 shadow-sm"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-900">
                  {isViewingToday ? "Live sync from office scanner." : `Viewing ${prettyDateLabel(selectedDate)}.`}
                </span>
                {" "}1st scan = <span className="font-semibold text-emerald-700">Check-In</span>. Subsequent scans update <span className="font-semibold text-orange-600">Check-Out</span>.
                {isViewingToday ? " Records reset at midnight." : " Historical view — read-only."}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500 shrink-0">
              {lastUpdated && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 border border-gray-200 cursor-default">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span className="font-mono font-medium text-gray-700">{lastUpdated}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end">
                    <span className="text-[11px]">Last sync from scanner</span>
                  </TooltipContent>
                </Tooltip>
              )}
              {rawCount !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 border border-gray-200 cursor-default">
                      <Database className="w-3 h-3 text-gray-500" />
                      <span className="font-mono font-medium text-gray-700">{rawCount}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end">
                    <span className="text-[11px]">{rawCount} record{rawCount !== 1 ? "s" : ""} in database today</span>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </motion.div>

          {/* ── Two-column: Today's Attendance + Missing Today ── */}
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
          >
          <div className="lg:col-span-8">
          {/* ── Attendance Table ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 bg-blue-500 rounded-full" />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {isViewingToday ? "Today's Attendance" : `Attendance · ${prettyDateLabel(selectedDate)}`}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedLocation} branch · {branchFilteredLogs.length} employee{branchFilteredLogs.length !== 1 ? "s" : ""}
                      {searchQuery && (
                        <span className="ml-1 text-blue-600">· {visibleLogs.length} matching</span>
                      )}
                    </p>
                  </div>
                </div>
                {isViewingToday ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                    <span>Auto-refresh · 5s</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Historical · Read-only
                  </div>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name, ID, department, or position…"
                  className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-900 transition-colors group">
                        Employee
                        <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortKey === "name" ? "opacity-100 text-blue-500" : "opacity-30 group-hover:opacity-60"}`} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => toggleSort("dept")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-900 transition-colors group">
                        Dept / Role
                        <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortKey === "dept" ? "opacity-100 text-blue-500" : "opacity-30 group-hover:opacity-60"}`} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => toggleSort("checkIn")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-900 transition-colors group">
                        Check In
                        <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortKey === "checkIn" ? "opacity-100 text-blue-500" : "opacity-30 group-hover:opacity-60"}`} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">In Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Check Out</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Out Status</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Scans</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                            {scannerStatus === "idle" ? (
                              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                            ) : scannerStatus === "error" ? (
                              <WifiOff className="w-5 h-5 text-red-400" />
                            ) : (
                              <Users className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              {scannerStatus === "idle"
                                ? "Connecting to scanner…"
                                : scannerStatus === "error"
                                ? "Scanner is offline"
                                : isViewingToday
                                ? `No scans yet at ${selectedLocation}`
                                : `No scans recorded at ${selectedLocation} on ${prettyDateLabel(selectedDate)}`}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {scannerStatus === "ok" && isViewingToday && "Records will appear here as employees scan in."}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleLogs.map((record) => (
                      <Tooltip key={record.empNo}>
                        <TooltipTrigger asChild>
                          <tr className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors cursor-default">
                            <td className="px-4 py-3.5">
                              <p className="text-sm font-semibold text-gray-900">{record.name}</p>
                              <p className="text-[11px] font-mono text-gray-400 mt-0.5">ID · {record.empNo}</p>
                            </td>
                            <td className="px-4 py-3.5 text-sm text-gray-600">
                              {record.dept !== "—" ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-gray-700">{record.dept}</span>
                                  {record.position !== "—" && (
                                    <>
                                      <span className="text-gray-300">·</span>
                                      <span className="text-gray-500">{record.position}</span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-sm text-gray-700">{formatDate(record.checkInTime)}</td>
                            <td className="px-4 py-3.5 text-sm font-mono font-semibold text-green-700">{record.checkInStr}</td>
                            <td className="px-4 py-3.5">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                record.checkInStatus === "On Time"
                                  ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                                  : "bg-red-50 text-red-700 ring-1 ring-red-200"
                              }`}>
                                {record.checkInStatus === "On Time" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                {record.checkInStatus}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-sm font-mono font-semibold text-orange-600">
                              {record.checkOutStr ?? <span className="text-gray-300 font-normal">—</span>}
                            </td>
                            <td className="px-4 py-3.5">
                              {record.checkOutStatus ? (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                  record.checkOutStatus === "Normal"
                                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                    : "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200"
                                }`}>
                                  {record.checkOutStatus === "Normal" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                  {record.checkOutStatus}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                  </span>
                                  Currently In
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center justify-center w-7 h-7 bg-gray-100 rounded-full text-xs font-mono font-semibold text-gray-600">{record.scanCount}</span>
                            </td>
                          </tr>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="center" className="!max-w-[260px]">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-gray-100">
                              <span className="text-sm font-semibold text-gray-900">{record.name}</span>
                              <span className="text-[10px] font-mono text-gray-400">{record.empNo}</span>
                            </div>
                            <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                              <span className="text-gray-500">Department</span>
                              <span className="font-medium text-gray-800">{record.dept}</span>
                              <span className="text-gray-500">Position</span>
                              <span className="font-medium text-gray-800">{record.position}</span>
                              <span className="text-gray-500">Scanner</span>
                              <span className="font-medium text-gray-800">{record.scannerLocation ?? "Unknown"}</span>
                              <span className="text-gray-500">Total scans</span>
                              <span className="font-medium text-gray-800">{record.scanCount}</span>
                              <span className="text-gray-500">Status</span>
                              <span className={`font-semibold ${record.checkOutStr ? "text-blue-700" : "text-emerald-700"}`}>
                                {record.checkOutStr ? "Checked Out" : "Currently In"}
                              </span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>

          <div className="lg:col-span-4">
          {/* ── Missing Employees (from BranchStaff) ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-red-500 rounded-full" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {isViewingToday ? "Missing Today" : `Missing on ${prettyDateLabel(selectedDate)}`}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedLocation} branch · {isViewingToday ? "Active staff not yet scanned" : "Active staff with no scan that day"}
                  </p>
                </div>
              </div>
              {missingEmployees.length > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="text-sm font-bold">{missingEmployees.length}</span>
                  <span className="text-xs font-medium text-red-600">missing</span>
                </div>
              )}
            </div>
            {missingEmployees.length === 0 ? (
              <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 ring-4 ring-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">All clear at {selectedLocation}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {isViewingToday
                      ? "Every active staff member has scanned in today."
                      : `Every active staff member scanned on ${prettyDateLabel(selectedDate)}.`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-h-[680px] overflow-y-auto divide-y divide-gray-100">
                {missingEmployees.map((s, i) => {
                  // Prefer full name (matches the attendance row column) and
                  // fall back to nickname only if name is blank.
                  const display = s.name ?? s.nickname ?? "—";
                  const initial = display.charAt(0).toUpperCase();
                  const tones = [
                    "bg-rose-50 text-rose-600 ring-rose-100",
                    "bg-amber-50 text-amber-600 ring-amber-100",
                    "bg-violet-50 text-violet-600 ring-violet-100",
                    "bg-sky-50 text-sky-600 ring-sky-100",
                    "bg-pink-50 text-pink-600 ring-pink-100",
                  ];
                  const tone = tones[i % tones.length];
                  return (
                    <Tooltip key={`${s.id}-${i}`}>
                      <TooltipTrigger asChild>
                        <div className="px-4 py-3 flex items-center gap-3 hover:bg-rose-50/30 transition-colors cursor-default">
                          <div className={`w-9 h-9 rounded-full ring-2 ${tone} flex items-center justify-center shrink-0 font-semibold text-sm`}>
                            {initial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{display}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {s.role && (
                                <span className="text-[11px] text-gray-500 truncate">{s.role}</span>
                              )}
                              {s.role && s.location && <span className="text-gray-300 text-[11px]">·</span>}
                              {s.location && (
                                <span className="text-[11px] text-gray-400 truncate">{s.location}</span>
                              )}
                            </div>
                          </div>
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="center" className="!max-w-[260px]">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-gray-100">
                            <span className="text-sm font-semibold text-gray-900">{display}</span>
                            <span className="text-[10px] font-mono text-gray-400">{s.employeeId ?? "—"}</span>
                          </div>
                          <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                            <span className="text-gray-500">Full name</span>
                            <span className="font-medium text-gray-800">{s.name ?? "—"}</span>
                            <span className="text-gray-500">Department</span>
                            <span className="font-medium text-gray-800">{s.department ?? "—"}</span>
                            <span className="text-gray-500">Role</span>
                            <span className="font-medium text-gray-800">{s.role ?? "—"}</span>
                            <span className="text-gray-500">Location</span>
                            <span className="font-medium text-gray-800">{s.location}</span>
                            <span className="text-gray-500">Email</span>
                            <span className="font-medium text-gray-800 truncate">{s.email ?? "—"}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
          </div>
          </motion.div>

          {/* ── Diagnostics ── */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-3.5 h-3.5 text-gray-400" />
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Diagnostics</h3>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="space-y-2">
              <details className="bg-white/60 border border-gray-200 rounded-lg overflow-hidden">
                <summary className="px-4 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-50 select-none flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 transition-transform [details[open]_&]:rotate-90" />
                  Registered Employees ({employees.length})
                </summary>
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Computed ID</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Position</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matched Today</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((e, i) => {
                        const matched = seenScannerIds.includes(e.scannerRef);
                        return (
                          <tr key={`${e.scannerRef || e.name}-${i}`} className={`border-t border-gray-100 hover:bg-gray-50 ${matched ? "bg-green-50" : ""}`}>
                            <td className="px-4 py-2 text-xs font-mono text-gray-600">{e.scannerRef || <span className="text-red-400">⚠ no ID</span>}</td>
                            <td className="px-4 py-2 text-sm text-gray-800 font-medium">{e.name}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{e.dept}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{e.position}</td>
                            <td className="px-4 py-2 text-xs">
                              {matched
                                ? <span className="text-green-600 font-semibold">✓ Scanned</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>

              {seenScannerIds.length > 0 && (
                <details className="bg-white/60 border border-gray-200 rounded-lg overflow-hidden">
                  <summary className="px-4 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 cursor-pointer hover:bg-gray-50 select-none flex items-center gap-2">
                    <ChevronRight className="w-3 h-3 transition-transform [details[open]_&]:rotate-90" />
                    Scanner Raw IDs ({seenScannerIds.length})
                  </summary>
                  <div className="px-6 py-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-3">
                      These are the exact <code>employeeNoString</code> values the scanner sent today.
                      If any are missing from the table above, the computed ID in employees.csv doesn&apos;t match.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {seenScannerIds.map((id) => {
                        const matched = employees.some((e) => e.scannerRef === id);
                        return (
                          <span
                            key={id}
                            className={`px-3 py-1 rounded-full text-xs font-mono font-semibold ${
                              matched
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {id} {matched ? "✓" : "⚠ no match"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </details>
              )}
            </div>
          </div>
        </main>
      </div>
      </TooltipProvider>
    </div>
  );
}
