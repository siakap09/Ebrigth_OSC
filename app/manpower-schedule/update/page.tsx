"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays } from "date-fns";
import { useSession } from "next-auth/react";
import Sidebar from "@/app/components/Sidebar";

// --- IMPORT SHARED CONSTANTS ---
import {
  SHARED_EMPLOYEES, ALL_BRANCHES, COLUMNS,
  getTimeSlotsForDay, isAdminSlot, getStaffColorByIndex,
  getWorkingDaysForBranch, isOpeningClosingSlot,
  isManagerOnDutySlot, isOnlineCoachOnly,
} from "@/lib/manpowerUtils";
import { isBranchManager } from "@/lib/roles";
import { isInTraining } from "@/lib/training";

function nameWithBadge(name: string, training?: { start?: string; end?: string }) {
  const inWindow = isInTraining(training?.start, training?.end);
  if (!inWindow) return name;
  return (
    <span title={`In training: ${training?.start} → ${training?.end}`}>
      {name} 🎓
    </span>
  );
}

// --- DATE FORMATTING HELPERS ---
const formatDateString = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "dd MMM yyyy");
  } catch (e) {
    return dateStr;
  }
};

const getDateForDay = (dayName: string, startDateStr: string) => {
  if (!startDateStr) return "";
  try {
    const start = parseISO(startDateStr);
    for (let i = 0; i < 7; i++) {
      const currentDate = addDays(start, i);
      if (format(currentDate, "EEEE").toLowerCase() === dayName.toLowerCase()) {
        return format(currentDate, "dd MMM yyyy");
      }
    }
  } catch (error) {
    return "";
  }
  return "";
};

// Helper to clean up long names for display
const getShortName = (fullName: string) => {
  if (!fullName) return "";
  // Split by space and take the first word (e.g., "NAQIB AL HUSSAINI" -> "NAQIB")
  return fullName.split(' ')[0];
};

// --- HELPER COMPONENT: DETAILED SUMMARY TABLE ---
const SummaryTable = ({ title, data, theme = "blue", trainingMap = {} }: { title: string, data: any[], theme?: "blue" | "orange", trainingMap?: Record<string, { start?: string; end?: string }> }) => {
  const formatTime = (d: number) => {
    const h = Math.floor(d);
    const m = Math.round((d - h) * 60);
    return { h: h, m: m.toString().padStart(2, '0') };
  };

  return (
    <div className={`overflow-hidden rounded-xl border ${theme === "orange" ? "border-orange-200" : "border-slate-200"} bg-white shadow-md w-full`}>
      <header className={`border-b px-4 py-2.5 text-center ${theme === "orange" ? "bg-orange-600 text-white" : "bg-[#2D3F50] text-white"}`}>
        <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-100 text-slate-600 border-b">
            <tr>
              <th className="p-2 border-r text-left w-8">No.</th>
              <th className="p-2 border-r text-left">Name</th>
              <th className="p-2 border-r text-center">Coach</th>
              <th className="p-2 border-r text-center">Exec</th>
              <th className="p-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, index) => {
              const c = formatTime(row.coachHrs);
              const e = formatTime(row.execHrs);
              const t = formatTime(row.total);
              return (
                <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                  <td className="p-2 border-r text-center text-slate-400 font-bold">{index + 1}</td>
                  <td className="p-2 border-r font-black text-slate-700">{nameWithBadge(row.name, trainingMap[row.name])}</td>
                  <td className="p-2 border-r text-center">
                    <span className="bg-slate-50 border rounded px-2 py-0.5 text-slate-600 font-bold">{c.h}h {c.m}m</span>
                  </td>
                  <td className="p-2 border-r text-center">
                    <span className="bg-slate-50 border rounded px-2 py-0.5 text-slate-600 font-bold">{e.h}h {e.m}m</span>
                  </td>
                  <td className="p-2 text-center">
                    <span className={`rounded-lg px-3 py-0.5 font-black border text-sm ${theme === "orange" ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-blue-50 border-blue-200 text-blue-600"}`}>
                      {t.h}h {t.m}m
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function UpdateSchedulePage() {
  const router = useRouter();
  const { data: session } = useSession();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [updatedSelections, setUpdatedSelections] = useState<Record<string, string>>({});
  const [updatedNotes, setUpdatedNotes] = useState<Record<string, string>>({});
  const [branchStaffData, setBranchStaffData] = useState<Record<string, string[]>>({});
  const [branchManagerData, setBranchManagerData] = useState<Record<string, string[]>>({});
  const [trainingMap, setTrainingMap] = useState<Record<string, { start?: string; end?: string }>>({});
  const [employeeIdMap, setEmployeeIdMap] = useState<Record<string, string>>({});
  const [columnReplacementBranch, setColumnReplacementBranch] = useState<Record<string, string>>({});
  const [managerReplacementBranch, setManagerReplacementBranch] = useState<Record<string, string>>({});
  const [scheduledElsewhere, setScheduledElsewhere] = useState<Record<string, Record<string, Set<string>>>>({});

  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePosition, setNewEmployeePosition] = useState("Part Time");
  const [addEmployeeError, setAddEmployeeError] = useState("");
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [drillYear, setDrillYear] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<number | null>(null);

  const fetchStaff = async () => {
    const res = await fetch('/api/branch-staff?include=all');
    const staffList = await res.json();
    if (!Array.isArray(staffList)) return;
    const grouped: Record<string, string[]> = {};
    const managers: Record<string, string[]> = {};
    const tmap: Record<string, { start?: string; end?: string }> = {};
    const idmap: Record<string, string> = {};
    staffList.forEach((s: any) => {
      if (!s.branch) return;
      if (!grouped[s.branch]) grouped[s.branch] = [];
      grouped[s.branch].push(s.name);
      if (s.role && s.role.startsWith('branch_manager')) {
        if (!managers[s.branch]) managers[s.branch] = [];
        managers[s.branch].push(s.name);
      }
      if (s.trainingStartDate || s.trainingEndDate) {
        tmap[s.name] = { start: s.trainingStartDate ?? undefined, end: s.trainingEndDate ?? undefined };
      }
      if (s.employeeId) {
        idmap[s.name] = s.employeeId;
      }
    });
    setBranchStaffData(grouped);
    setBranchManagerData(managers);
    setTrainingMap(tmap);
    setEmployeeIdMap(idmap);
  };

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const res = await fetch('/api/schedules');
        const data = await res.json();
        if (data.success) setHistory(data.schedules);
      } catch (err) {
        console.error("Failed to load schedules", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSchedules();
    fetchStaff();
  }, []);

  const userRole = (session?.user as any)?.role || "USER";
  const userBranch = (session?.user as any)?.branchName;

  const filteredHistory = useMemo(() => {
    return history.filter((record: any) => {
      if (isBranchManager(userRole) && record.branch !== userBranch) return false;
      if (filterBranch && record.branch !== filterBranch) return false;
      return true;
    });
  }, [history, filterBranch, userRole, userBranch]);

  // Compute which staff are already scheduled at other branches for the same week
  useEffect(() => {
    if (!selectedRecord) return;
    const map: Record<string, Record<string, Set<string>>> = {};
    history.forEach((s: any) => {
      if (s.startDate !== selectedRecord.startDate || s.branch === selectedRecord.branch) return;
      const dayMap: Record<string, Set<string>> = {};
      Object.entries(s.selections || {}).forEach(([key, val]: [string, any]) => {
        if (!val || val === "None") return;
        const dayName = key.split('-')[0];
        if (!dayMap[dayName]) dayMap[dayName] = new Set();
        dayMap[dayName].add((val as string).toUpperCase());
      });
      if (Object.keys(dayMap).length > 0) map[s.branch] = dayMap;
    });
    setScheduledElsewhere(map);
  }, [selectedRecord, history]);

  const handleAddEmployee = async () => {
    if (!newEmployeeName.trim()) { setAddEmployeeError("Name cannot be empty."); return; }
    if (!selectedRecord) return;
    setIsAddingEmployee(true);
    setAddEmployeeError("");
    try {
      const res = await fetch('/api/branch-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEmployeeName.trim(), branch: selectedRecord.branch, position: newEmployeePosition }),
      });
      const data = await res.json();
      if (!res.ok) { setAddEmployeeError(data.error || "Failed to add employee."); return; }
      await fetchStaff();
      setNewEmployeeName("");
      setNewEmployeePosition("Part Time");
      setShowAddEmployeeModal(false);
    } catch {
      setAddEmployeeError("Something went wrong. Please try again.");
    } finally {
      setIsAddingEmployee(false);
    }
  };

  const sanitizeSelections = (selections: Record<string, any>, branch?: string) => {
    const allKnownStaff = [...SHARED_EMPLOYEES, ...(branch ? (branchStaffData[branch] || []) : Object.values(branchStaffData).flat())];
    const nameLookup = new Map(allKnownStaff.map(n => [n.toLowerCase(), n]));
    // Build a lookup across ALL branches to validate replacement staff
    const allStaffFlat = Object.values(branchStaffData).flat();
    const allStaffLower = new Map(allStaffFlat.map(n => [n.toLowerCase(), n]));
    return Object.fromEntries(
      Object.entries(selections || {})
        .filter(([, v]) => v && v !== "None")
        .map(([k, v]) => {
          const storedLower = (v as string).toLowerCase();
          const exactMatch = nameLookup.get(storedLower);
          if (exactMatch) return [k, exactMatch];
          // Fuzzy: handles "Thiru" → "Thiru (Training)" when base name matches
          const fuzzyMatch = allKnownStaff.find(n => n.toLowerCase().startsWith(storedLower + ' '));
          if (fuzzyMatch) return [k, fuzzyMatch];
          // Check if this is a valid replacement staff from another branch
          const anyBranchMatch = allStaffLower.get(storedLower);
          if (anyBranchMatch) return [k, anyBranchMatch];
          // Not found anywhere in BranchStaff — stale entry, drop it
          return [k, null];
        })
        .filter(([, v]) => v !== null)
    );
  };

  const handleSelectRecord = (record: any) => {
    setSelectedRecord(record);
    setUpdatedSelections(sanitizeSelections(record.selections, record.branch));
    setUpdatedNotes({ ...record.notes });
    const days = getWorkingDaysForBranch(record.branch);
    if (days.length > 0) setSelectedDay(days[0]);
  };

  const handleActualNameSelect = (day: string, targetTime: string, colId: string, name: string) => {
    if (!selectedRecord) return;
    setUpdatedSelections((prev) => {
      const next = { ...prev };
      if (!name || name === "None") {
        delete next[`${day}-${targetTime}-${colId}`];
      } else {
        // Auto-fill ALL non-opening/closing slots in this column (same logic as Plan New Week)
        const daySlots = getTimeSlotsForDay(day, selectedRecord.branch);
        daySlots.forEach((slot) => {
          if (!isOpeningClosingSlot(slot, selectedRecord.branch)) {
            if (colId === "MANAGER") {
              const usedAsStaff = COLUMNS.some(c => next[`${day}-${slot}-${c.id}`] === name);
              if (usedAsStaff) return;
            } else {
              if (next[`${day}-${slot}-MANAGER`] === name) return;
              const usedInOtherColumn = COLUMNS.filter(c => c.id !== colId).some(c => next[`${day}-${slot}-${c.id}`] === name);
              if (usedInOtherColumn) return;
            }
            next[`${day}-${slot}-${colId}`] = name;
          }
        });
      }
      return next;
    });
  };

  const handleClearDay = (day: string) => {
    if (!window.confirm(`Clear assignments for ${day}?`)) return;
    setUpdatedSelections(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => { if (key.startsWith(`${day}-`)) delete next[key]; });
      return next;
    });
  };

  const clearManagerForDay = (day: string) => {
    setUpdatedSelections(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => { if (key.startsWith(`${day}-`) && key.endsWith(`-MANAGER`)) delete next[key]; });
      return next;
    });
  };

  const handleClearColumn = (day: string, colId: string) => {
    setUpdatedSelections(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => { if (key.startsWith(`${day}-`) && key.endsWith(`-${colId}`)) delete next[key]; });
      return next;
    });
  };

  const calculateHoursForData = (selections: Record<string, string>, isOriginalData = false) => {
    if (!selectedRecord) return [];
    const rawData = isOriginalData ? (selectedRecord.originalSelections || selectedRecord.selections) : selections;
    if (!rawData) return [];
    const dataToCalculate = sanitizeSelections(rawData, selectedRecord.branch);

    const managerNames = new Set(Object.values(branchManagerData).flat());
    const allBranchStaff = (branchStaffData[selectedRecord.branch] || []).filter(n => !managerNames.has(n));
    const uniqueEmployeesToTrack: string[] = Array.from(new Set([
      ...allBranchStaff,
      ...(Object.values(dataToCalculate) as string[]).filter(e => e && e !== "None" && !managerNames.has(e))
    ]));

    const staffStats: Record<string, { coachHrs: number; execHrs: number; total: number }> = {};
    uniqueEmployeesToTrack.forEach(emp => { staffStats[emp] = { coachHrs: 0, execHrs: 0, total: 0 }; });

    getWorkingDaysForBranch(selectedRecord.branch).forEach((day) => {
      const isWeekend = day === "Saturday" || day === "Sunday";
      const dailyTarget = isWeekend ? 10.5 : 5.0;
      const branchForDay = selectedRecord.branch;

      uniqueEmployeesToTrack.forEach((emp) => {
        let coachingHoursForDay = 0;
        let workedThatDay = false;
        getTimeSlotsForDay(day, branchForDay).forEach((slot: string) => {
          if (isOpeningClosingSlot(slot, branchForDay)) return;
          COLUMNS.forEach((col) => {
            if (dataToCalculate[`${day}-${slot}-${col.id}`] === emp) {
              workedThatDay = true;
              if (col.type === "coach") coachingHoursForDay += isAdminSlot(slot, branchForDay) ? 0.25 : 1.25;
            }
          });
        });
        if (workedThatDay) {
          // Online-branch coaches (except the exempt two) have no exec hours —
          // they're tracked on coaching hours only.
          const coachOnly = isOnlineCoachOnly(branchForDay, employeeIdMap[emp]);
          staffStats[emp].coachHrs += coachingHoursForDay;
          if (!coachOnly) {
            staffStats[emp].execHrs += Math.max(0, dailyTarget - coachingHoursForDay);
          }
          staffStats[emp].total = staffStats[emp].coachHrs + staffStats[emp].execHrs;
        }
      });
    });
    return Object.entries(staffStats).map(([name, stats]) => ({ name, ...stats }));
  };

  const handleUpdateSave = async () => {
    if (!window.confirm("Save adjustments to the database?")) return;
    
    const updatedRecord = {
      ...selectedRecord,
      selections: sanitizeSelections(updatedSelections),
      notes: updatedNotes,
      status: "Updated",
    };

    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord)
      });

      if (!response.ok) throw new Error("Failed to save");

      alert("Adjustments Saved Successfully! 💾");
      setHistory(prev => prev.map(h => h.id === updatedRecord.id ? updatedRecord : h));
      setSelectedRecord(null);
      
    } catch (error) {
      console.error(error);
      alert("Error saving adjustments to database.");
    }
  };


  if (selectedRecord) {
    
    const originalData = sanitizeSelections(selectedRecord.originalSelections || selectedRecord.selections || {}, selectedRecord.branch);
    const originalNotes = selectedRecord.notes || selectedRecord.originalNotes || {};

    return (
      <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
        
        <main className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ zoom: 1.0 }}>
          
          <div className="shrink-0 w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 z-50 bg-slate-50">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center gap-6 mb-6">
              <div className="flex items-center gap-6">
                

                <button
                  onClick={() => setSelectedRecord(null)}
                  className="bg-slate-200 text-slate-700 hover:bg-slate-300 px-6 py-3 rounded-xl font-bold uppercase transition-colors flex items-center gap-2 shadow-sm"
                >
                  ← Back to List
                </button>
                <div className="h-8 w-px bg-slate-300"></div>
                <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0 flex items-center gap-4">
                  <span>Updating: {selectedRecord.branch}</span>
                  {selectedRecord.startDate && selectedRecord.endDate && (
                    <span className="text-sm bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg font-bold tracking-widest uppercase">
                      {formatDateString(selectedRecord.startDate)} - {formatDateString(selectedRecord.endDate)}
                    </span>
                  )}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowAddEmployeeModal(true); setNewEmployeeName(""); setNewEmployeePosition("Part Time"); setAddEmployeeError(""); }}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl text-sm font-black uppercase shadow-md transition-colors flex items-center gap-2"
                >
                  + Add Employee
                </button>
                <button onClick={handleUpdateSave} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl text-sm font-black uppercase shadow-md transition-colors flex items-center gap-2">
                  <span>💾</span> Save Adjustments
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-20">
            <div className="space-y-6 mb-10">

              {/* DAY TAB BUTTONS */}
              <div className="flex gap-2 flex-wrap">
                {getWorkingDaysForBranch(selectedRecord.branch).map((day) => {
                  const isActive = selectedDay === day;
                  const hasData = Object.keys(updatedSelections).some(k => k.startsWith(`${day}-`));
                  return (
                    <button key={day} onClick={() => setSelectedDay(day)}
                      className={`relative px-6 py-3 rounded-xl font-black uppercase text-sm tracking-wide transition-all shadow-sm ${
                        isActive ? "bg-[#2D3F50] text-white shadow-lg scale-105"
                        : hasData ? "bg-orange-50 text-orange-700 border-2 border-orange-300 hover:bg-orange-100"
                        : "bg-white text-slate-500 border-2 border-slate-200 hover:bg-slate-50"
                      }`}>
                      {day.slice(0, 3)}
                      {hasData && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${isActive ? "bg-green-400" : "bg-orange-500"}`} />}
                    </button>
                  );
                })}
              </div>

              {selectedDay && (() => {
                const day = selectedDay;
                const slots = getTimeSlotsForDay(day, selectedRecord.branch);
                const currentStaff = [...SHARED_EMPLOYEES, ...(branchStaffData[selectedRecord.branch] || [])];
                const currentStaffLower = new Set(currentStaff.map(n => n.toLowerCase()));
                // Include replacement staff from other branches already saved in this record
                const namesInRecord = Array.from(new Set([
                  ...Object.values(originalData).filter((v): v is string => !!v && v !== "None"),
                  ...Object.values(updatedSelections).filter((v): v is string => !!v && v !== "None"),
                ]));
                const extraNames = namesInRecord.filter(n => !currentStaffLower.has(n.toLowerCase()));
                const activeStaffList = Array.from(new Set([...currentStaff, ...extraNames]));
                return (
                  <div key={day} className="bg-white rounded-xl shadow-lg p-3 border-t-2 border-orange-500">
                    <div className="relative flex flex-col justify-center items-center mb-3 border-b pb-2 min-h-[30px]">
                      <h2 className="text-lg font-black uppercase text-slate-700 m-0 leading-none">{day}</h2>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {getDateForDay(day, selectedRecord.startDate)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-4">

                      {/* ===== PLANNING SIDE (read-only) ===== */}
                      <div className="flex-1 opacity-60 flex flex-col min-w-0">
                        <div className="bg-slate-500 p-1.5 text-center font-bold text-[9px] uppercase mb-1 rounded text-white tracking-widest h-8 sticky left-0 right-0 z-30">
                            Planning
                        </div>
                        <div className="overflow-x-auto border rounded relative">
                          <table className="w-full border-collapse text-[11px]" style={{ minWidth: '1700px' }}>
                            <thead>
                              <tr className="bg-slate-700 text-white text-center h-[40px]">
                                <th className="p-1 border border-slate-600 w-32 sticky left-0 z-20 bg-slate-700">
                                  <div className="flex flex-col items-center"><span>Slot</span></div>
                                </th>
                                <th className="p-1 border border-slate-600 w-24 bg-slate-700 border-b-2 border-b-emerald-400">
                                  <div className="flex flex-col items-center"><span>Manager</span></div>
                                </th>
                                {COLUMNS.map(c => (
                                  <th key={c.id} className={`p-1 border border-slate-600 w-24 ${c.type==='exec'?'bg-slate-800':''}`}>
                                    <div className="flex flex-col items-center"><span>{c.label}</span></div>
                                  </th>
                                ))}
                                <th className="p-1 border border-slate-600 w-40">
                                  <div className="flex flex-col items-center"><span>Notes</span></div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {slots.map((slot, slotIndex) => {
                                const isOpenClose = isOpeningClosingSlot(slot, selectedRecord.branch);
                                // --- KEY FIX: per-slot manager logic for Planning side ---
                                const showManagerPlanning = isManagerOnDutySlot(slot, selectedRecord.branch, day);
                                const planningManagerName =
                                  originalData[`${day}-${slot}-MANAGER`] ||     // new format
                                  originalNotes[`${day}-MANAGER`] ||             // legacy format
                                  "";

                                return (
                                  <tr key={slot} className={`h-[32px] ${isOpenClose ? 'bg-blue-50' : ''}`}>
                                    <td className={`p-1 border font-bold sticky left-0 z-10 h-[32px] ${isOpenClose ? 'bg-blue-100' : 'bg-slate-50'}`}>{slot}</td>
                                    
                                    {/* Planning Manager Cell — per slot, no rowSpan */}
                                    {!isOpenClose && (
                                      <td className="p-1 border bg-emerald-50 text-center font-bold align-middle h-[32px]">
                                        {showManagerPlanning ? (
                                          planningManagerName ? (
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${planningManagerName ? '' : ''}`}>
                                              {getShortName(planningManagerName)}
                                            </span>
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <span className="text-[8px] text-emerald-200">—</span>
                                          </div>
                                        )}
                                      </td>
                                    )}

                                    {isOpenClose ? (
                                      <td colSpan={COLUMNS.length + (isOpenClose ? 2 : 1)} className="p-1 border text-center">
                                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})</span>
                                      </td>
                                    ) : (
                                      <>
                                        {COLUMNS.map(col => {
                                          const name = originalData[`${day}-${slot}-${col.id}`];
                                          const validName = name && name !== "None" ? name : "";
                                          return (
                                            <td key={col.id} className={`p-1 border text-center font-bold h-[32px] ${validName ? getStaffColorByIndex(validName, activeStaffList) : 'bg-white'}`}>
                                              {getShortName(validName) || "-"}
                                            </td>
                                          );
                                        })}
                                        <td className="p-1 border bg-white italic text-slate-400 h-[32px]">...</td>
                                      </>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* ===== ACTUAL SIDE (editable) ===== */}
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="bg-orange-600 p-1.5 flex justify-between items-center mb-1 rounded text-white tracking-widest h-8 sticky left-0 right-0 z-30">
                            <div className="w-fit min-w-[100px] text-[10px] font-black bg-black/10 px-2 py-1 rounded">
                                {selectedRecord.branch}
                            </div>
                            <span className="font-bold text-[11px] uppercase">Actual</span>
                            <div className="w-24 flex justify-end">
                              <button onClick={() => handleClearDay(day)} className="text-[9px] font-bold bg-orange-800 px-1.5 py-0.5 rounded">CLEAR DAY</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto border rounded relative">
                          <table className="w-full border-collapse text-[11px]" style={{ minWidth: '1700px' }}>
                            <thead>
                              <tr className="bg-[#2D3F50] text-white h-[40px]">
                                <th className="p-1 border border-slate-900 w-32 sticky left-0 z-20 bg-[#2D3F50]">
                                  <div className="flex flex-col items-center"><span>Slot</span></div>
                                </th>
                                <th className="p-1 border border-slate-900 w-24 bg-slate-700 border-b-2 border-b-emerald-400">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span>Manager</span>
                                    <select
                                      value={managerReplacementBranch[day] || ""}
                                      onChange={(e) => setManagerReplacementBranch(prev => ({ ...prev, [day]: e.target.value }))}
                                      className="text-[9px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                                    >
                                      <option value="">Own Branch</option>
                                      {ALL_BRANCHES.filter(b => b !== selectedRecord.branch).map(b => (
                                        <option key={b} value={b}>{b}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => clearManagerForDay(day)} className="text-[9px] text-orange-300 font-bold hover:text-white uppercase px-2 py-0.5 rounded transition-colors bg-slate-600">CLEAR</button>
                                  </div>
                                </th>
                                {COLUMNS.map(c => (
                                  <th key={c.id} className={`p-1 border border-slate-900 w-24 ${c.type==='exec'?'bg-slate-700 border-b-2 border-b-blue-400':''}`}>
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span>{c.label}</span>
                                      <select
                                        value={columnReplacementBranch[`${day}-${c.id}`] || ""}
                                        onChange={(e) => setColumnReplacementBranch(prev => ({ ...prev, [`${day}-${c.id}`]: e.target.value }))}
                                        className="text-[9px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                                      >
                                        <option value="">Own Branch</option>
                                        {ALL_BRANCHES.filter(b => b !== selectedRecord.branch).map(b => (
                                          <option key={b} value={b}>{b}</option>
                                        ))}
                                      </select>
                                      <button onClick={() => handleClearColumn(day, c.id)} className="text-[9px] text-orange-300 font-bold hover:text-white py-0.5">CLEAR</button>
                                    </div>
                                  </th>
                                ))}
                                <th className="p-1 border border-slate-900 w-40">
                                  <div className="flex flex-col items-center"><span>Notes</span></div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {slots.map((slot, slotIndex) => {
                                const isOpenClose = isOpeningClosingSlot(slot, selectedRecord.branch);
                                // --- KEY FIX: per-slot manager logic for Actual side ---
                                const showManagerActual = isManagerOnDutySlot(slot, selectedRecord.branch, day);
                                const rawManagerVal =
                                  updatedSelections[`${day}-${slot}-MANAGER`] ||
                                  updatedNotes[`${day}-MANAGER`] ||
                                  "";
                                const actualManagerVal = rawManagerVal === "None" ? "" : rawManagerVal;

                                return (
                                  <tr key={slot} className={`group h-[32px] ${isOpenClose ? 'bg-blue-50' : ''}`}>
                                    <td className={`p-1 border font-bold sticky left-0 z-10 h-[32px] ${isOpenClose ? 'bg-blue-100' : 'bg-orange-50 group-hover:bg-orange-100'}`}>{slot}</td>

                                    {/* Actual Manager Cell — per slot, no rowSpan */}
                                    {!isOpenClose && (
                                      <td className="p-1 border bg-emerald-50 align-middle h-[32px]">
                                        {showManagerActual ? (
                                          // Show editable dropdown for manager slots
                                          <select
                                            value={actualManagerVal}
                                            onChange={(e) => handleActualNameSelect(day, slot, "MANAGER", e.target.value)}
                                            className="w-full h-full p-1 text-[11px] font-bold text-center border border-emerald-200 rounded bg-white appearance-none outline-none"
                                          >
                                            <option value="">-- Select --</option>
                                            {(branchManagerData[managerReplacementBranch[day] || selectedRecord.branch] || []).map(e => {
                                              const mgReplacementBranch = managerReplacementBranch[day];
                                              const conflictBranch = mgReplacementBranch
                                                ? Object.entries(scheduledElsewhere).find(([, dayMap]) => dayMap[day]?.has(e.toUpperCase()))?.[0]
                                                : undefined;
                                              const isConflict = !!conflictBranch;
                                              return (
                                                <option key={e} value={e} disabled={isConflict}>
                                                  {isConflict ? `${e} (at ${conflictBranch})` : `${e}${isInTraining(trainingMap[e]?.start, trainingMap[e]?.end) ? ' 🎓' : ''}`}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        ) : (
                                          // Empty placeholder for slots after manager's shift
                                          <div className="w-full h-full flex items-center justify-center">
                                            <span className="text-[8px] text-emerald-200">—</span>
                                          </div>
                                        )}
                                      </td>
                                    )}

                                    {isOpenClose ? (
                                      <td colSpan={COLUMNS.length + 1} className="p-1 border text-center">
                                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">All Staff — Executive ({slotIndex === 0 ? "Opening" : "Closing"})</span>
                                      </td>
                                    ) : (
                                      <>
                                        {COLUMNS.map(col => {
                                          const rawVal = updatedSelections[`${day}-${slot}-${col.id}`] || "";
                                          const val = rawVal === "None" ? "" : rawVal;
                                          const replacementBranch = columnReplacementBranch[`${day}-${col.id}`];
                                          const colStaffList = replacementBranch
                                            ? (branchStaffData[replacementBranch] || [])
                                            : activeStaffList;
                                          // Block names used in same slot across any column type (cross-type per-slot conflict)
                                          const namesInSameSlot = new Set(
                                            COLUMNS.filter(c => c.id !== col.id)
                                              .map(c => updatedSelections[`${day}-${slot}-${c.id}`])
                                              .filter(Boolean)
                                          );
                                          const namesUsedInOtherColumns = new Set([
                                            ...namesInSameSlot,
                                            ...(actualManagerVal ? [actualManagerVal] : []),
                                          ]);
                                          return (
                                            <td key={col.id} className={`p-0 border h-[32px] ${col.type==='exec' ? 'bg-slate-50' : 'bg-white'}`}>
                                              <select value={val} onChange={(e) => handleActualNameSelect(day, slot, col.id, e.target.value)}
                                                className={`w-full h-full p-1 outline-none font-bold text-center appearance-none block ${val && val !== "None" ? getStaffColorByIndex(val, activeStaffList) : 'bg-transparent text-slate-300'}`}>
                                                <option value="">None</option>
                                                {colStaffList.map(e => {
                                                  const conflictBranch = replacementBranch
                                                    ? Object.entries(scheduledElsewhere).find(([, dayMap]) => dayMap[day]?.has(e.toUpperCase()))?.[0]
                                                    : undefined;
                                                  const isConflict = !!conflictBranch;
                                                  return (
                                                    <option key={e} value={e} disabled={namesUsedInOtherColumns.has(e) || isConflict} className="text-black">
                                                      {isConflict ? `${e} (at ${conflictBranch})` : `${e}${isInTraining(trainingMap[e]?.start, trainingMap[e]?.end) ? ' 🎓' : ''}`}
                                                    </option>
                                                  );
                                                })}
                                              </select>
                                            </td>
                                          );
                                        })}
                                        <td className="p-0 border bg-white h-[32px]">
                                          <textarea value={updatedNotes[`${day}-${slot}-notes`] || ""} onChange={(e) => setUpdatedNotes(p => ({...p, [`${day}-${slot}-notes`]: e.target.value}))} className="w-full h-full p-1 text-[10px] resize-none outline-none italic text-slate-600 block" />
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="mt-6 bg-white p-4 rounded-xl border border-slate-200 shadow-md">
                <h2 className="text-sm font-black text-center uppercase tracking-widest text-slate-800 mb-4">📊 Staff Hours Comparison</h2>
                <div className="flex flex-col gap-4">
                    <SummaryTable title="ORIGINAL" data={calculateHoursForData({}, true)} theme="blue" trainingMap={trainingMap} />
                    <SummaryTable title="ADJUSTED" data={calculateHoursForData(updatedSelections, false)} theme="orange" trainingMap={trainingMap} />
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* ADD EMPLOYEE MODAL */}
        {showAddEmployeeModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-sm flex flex-col gap-5">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight text-center">Add Employee</h2>
              <div className="text-xs text-slate-500 text-center font-bold uppercase tracking-widest bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                Branch: {selectedRecord.branch}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Full Name</label>
                <input
                  type="text"
                  value={newEmployeeName}
                  onChange={(e) => { setNewEmployeeName(e.target.value); setAddEmployeeError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddEmployee(); }}
                  placeholder="e.g. Ahmad Bin Ali"
                  className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors"
                  autoFocus
                />
                {addEmployeeError && (
                  <p className="text-xs text-red-500 font-bold">{addEmployeeError}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Role</label>
                <select
                  value={newEmployeePosition}
                  onChange={(e) => setNewEmployeePosition(e.target.value)}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors"
                >
                  <option value="Part Time">Part Time</option>
                  <option value="Full Time">Full Time</option>
                  <option value="Branch Manager">Branch Manager</option>
                </select>
                {newEmployeePosition === "Branch Manager" && (
                  <p className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    This person will be set as Manager on Duty for {selectedRecord.branch}.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddEmployeeModal(false)}
                  className="flex-1 py-3 bg-slate-200 text-slate-700 font-black rounded-xl hover:bg-slate-300 uppercase tracking-widest text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEmployee}
                  disabled={isAddingEmployee}
                  className="flex-1 py-3 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 disabled:bg-slate-300 uppercase tracking-widest text-sm transition-colors"
                >
                  {isAddingEmployee ? "Saving..." : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />
        
        <main className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ zoom: 1.0 }}>
            
            <div className="shrink-0 w-full mx-auto px-4 md:px-6 pt-4 md:pt-6 z-50 bg-slate-50">
              
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-6">

                <button
                  onClick={() => router.push('/manpower-schedule')}
                  className="bg-blue-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md hover:bg-blue-600 transition-colors"
                >
                  <span className="text-xl">👥</span>
                  <span className="text-base font-black uppercase tracking-wide leading-none">HRMS</span>
                </button>
                <div className="h-8 w-px bg-slate-300"></div>
                <h1 className="text-lg font-black uppercase tracking-wide text-slate-800 leading-none m-0">
                  Update Manpower Schedule
                </h1>
              </div>

              {!isBranchManager(userRole) && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6">
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Branch</label>
                  <select value={filterBranch} onChange={(e) => { setFilterBranch(e.target.value); setDrillYear(null); setDrillMonth(null); }}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-blue-500 transition-colors">
                    <option value="">All Branches</option>
                    {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto w-full mx-auto px-4 md:px-6 pb-12">
              {isLoading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                </div>
              ) : (() => {
                const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                // Derive week rows from actual planned schedules instead of fixed calendar ranges
                const distinctWeeks = Array.from(new Set(
                  (drillYear !== null && drillMonth !== null
                    ? filteredHistory.filter((r: any) =>
                        format(parseISO(r.startDate), "yyyy") === drillYear &&
                        parseInt(format(parseISO(r.startDate), "M")) - 1 === drillMonth
                      )
                    : []
                  ).map((r: any) => r.startDate)
                ))
                  .sort()
                  .map(startDate => {
                    const rec = filteredHistory.find((r: any) => r.startDate === startDate);
                    return {
                      startDate,
                      endDate: rec?.endDate ?? startDate,
                      label: `${format(parseISO(startDate as string), "dd MMM")} – ${format(parseISO(rec?.endDate ?? startDate as string), "dd MMM")}`,
                    };
                  });
                const byYear: Record<string, any[]> = {};
                filteredHistory.forEach((r: any) => {
                  const y = format(parseISO(r.startDate), "yyyy");
                  if (!byYear[y]) byYear[y] = [];
                  byYear[y].push(r);
                });

                if (drillYear !== null && drillMonth !== null) {
                  const monthRecs = filteredHistory.filter((r: any) =>
                    format(parseISO(r.startDate), "yyyy") === drillYear &&
                    parseInt(format(parseISO(r.startDate), "M")) - 1 === drillMonth
                  );
                  return (
                    <div>
                      <div className="flex items-center gap-3 mb-5">
                        <button onClick={() => setDrillMonth(null)} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-black transition-colors shadow-sm">← Back</button>
                        <h2 className="text-lg font-black uppercase tracking-widest text-slate-800">{drillYear} <span className="text-slate-400">›</span> {MONTH_NAMES[drillMonth]}</h2>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {distinctWeeks.map((week, wi) => {
                          const weekRecs = monthRecs.filter((r: any) => r.startDate === week.startDate);
                          return (
                            <div key={week.startDate} className={`flex gap-4 items-start px-5 py-4 ${wi < distinctWeeks.length - 1 ? "border-b border-slate-100" : ""}`}>
                              <div className="w-28 shrink-0 text-xs font-black text-slate-400 pt-2">{week.label}</div>
                              <div className="flex flex-wrap gap-2 flex-1">
                                {weekRecs.length > 0 ? weekRecs.map((record: any) => (
                                  <button key={record.id} onClick={() => handleSelectRecord(record)}
                                    className="text-left bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-xl px-4 py-3 transition-colors min-w-[160px]">
                                    <div className="font-black text-sm text-orange-800 uppercase tracking-wide">{record.branch}</div>
                                    <div className="text-xs text-orange-500 font-bold mt-0.5">
                                      {format(parseISO(record.startDate), "dd MMM")} – {format(parseISO(record.endDate), "dd MMM")}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${record.status === "Updated" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                                      {record.status || "Finalized"}
                                    </span>
                                  </button>
                                )) : <span className="text-slate-200 text-sm font-bold pt-1">—</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (Object.keys(byYear).length === 0) {
                  return (
                    <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-300 text-center shadow-sm">
                      <p className="text-slate-500 font-bold text-lg uppercase tracking-widest">No schedules found.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {Object.keys(byYear).sort((a, b) => parseInt(b) - parseInt(a)).map(year => {
                      const recs = byYear[year];
                      const monthCounts: Record<number, number> = {};
                      recs.forEach((r: any) => {
                        const mi = parseInt(format(parseISO(r.startDate), "M")) - 1;
                        monthCounts[mi] = (monthCounts[mi] || 0) + 1;
                      });
                      return (
                        <div key={year} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="bg-[#2D3F50] px-6 py-3">
                            <h2 className="text-white font-black text-xl uppercase tracking-widest">{year}</h2>
                          </div>
                          <div className="p-4 grid grid-cols-6 gap-2">
                            {[0,1,2,3,4,5,6,7,8,9,10,11].map(mi => {
                              const count = monthCounts[mi] || 0;
                              const hasRecords = count > 0;
                              return (
                                <button key={mi}
                                  onClick={() => { if (hasRecords) { setDrillYear(year); setDrillMonth(mi); } }}
                                  disabled={!hasRecords}
                                  className={`rounded-xl py-3 px-2 text-center transition-colors ${hasRecords ? "bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
                                >
                                  <div className="font-black text-sm">{MONTH_SHORT[mi]}</div>
                                  {hasRecords && <div className="text-[10px] mt-0.5 opacity-80">{count}</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
        </main>
      </div>
    </>
  );
}