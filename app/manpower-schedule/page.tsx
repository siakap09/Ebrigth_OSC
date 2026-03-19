"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format, parseISO, addDays } from "date-fns";
import WeekSelector from "@/app/components/WeekSelector";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";

const SHARED_EMPLOYEES = ["Iqbal", "Ying Chen", "Adam", "Faiq", "Salman"];

// Full branch list for both planning and filtering
const ALL_BRANCHES = [
  "Subang Taipan", "Setia Alam", "Shah Alam", "Putrajaya", "Ampang", 
  "Cyberjaya", "Klang", "Bandar Baru Bangi", "Taman Sri Gombak", "Online", 
  "Kajang TTDI Groove", "Kota Warisan", "Bandar Tun Hussein Onn", "Danau Kota", 
  "Denai Alam", "Sri Petaling", "Eco Grandeur", "Kota Damansara", 
  "Bandar Seri Putra", "Rimbayu",
].sort();

const COLUMNS = [
  { id: "coach1", label: "Coach 1", type: "coach" as const, employees: SHARED_EMPLOYEES },
  { id: "coach2", label: "Coach 2", type: "coach" as const, employees: SHARED_EMPLOYEES },
  { id: "coach3", label: "Coach 3", type: "coach" as const, employees: SHARED_EMPLOYEES },
  { id: "coach4", label: "Coach 4", type: "coach" as const, employees: SHARED_EMPLOYEES },
  { id: "coach5", label: "Coach 5", type: "coach" as const, employees: SHARED_EMPLOYEES },
  { id: "exec1", label: "Executive 1", type: "executive" as const, employees: SHARED_EMPLOYEES },
  { id: "exec2", label: "Executive 2", type: "executive" as const, employees: SHARED_EMPLOYEES },
  { id: "exec3", label: "Executive 3", type: "executive" as const, employees: SHARED_EMPLOYEES },
  { id: "exec4", label: "Executive 4", type: "executive" as const, employees: SHARED_EMPLOYEES },
  { id: "exec5", label: "Executive 5", type: "executive" as const, employees: SHARED_EMPLOYEES },
] as const;

const EMPLOYEE_COLORS: Record<string, string> = {
  "Iqbal": "bg-blue-400 text-white border-blue-500",
  "Ying Chen": "bg-pink-300 text-white border-pink-400",
  "Adam": "bg-purple-400 text-white border-purple-500",
  "Faiq": "bg-indigo-400 text-white border-indigo-500",
  "Salman": "bg-teal-400 text-white border-teal-500",
};

type ColumnId = (typeof COLUMNS)[number]["id"];

const DAYS = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const WEEKDAY_DAYS = ["Wednesday", "Thursday", "Friday"] as const;

const DEFAULT_WEEKDAY_TIME_SLOTS = ["5:00 PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "10:00 PM"] as const;
const DEFAULT_WEEKEND_TIME_SLOTS = ["08:45 AM – 09:15 AM", "09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "11:45 AM – 12:00 PM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:30 PM – 2:45 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:15 PM – 5:30 PM", "5:30 PM – 6:45 PM", "6:45 PM – 7:15 PM"] as const;
const TAIPAN_WEEKDAY_TIME_SLOTS = ["4:15 PM", "04.30PM - 05.45PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "10:00 PM"] as const;

const BRANCH_SLOTS_CONFIG: Record<string, { weekday: readonly string[], weekend: readonly string[] }> = {
  "Subang Taipan": { weekday: TAIPAN_WEEKDAY_TIME_SLOTS, weekend: DEFAULT_WEEKEND_TIME_SLOTS },
  "default": { weekday: DEFAULT_WEEKDAY_TIME_SLOTS, weekend: DEFAULT_WEEKEND_TIME_SLOTS }
};

function getTimeSlotsForDay(day: string, branchName: string): readonly string[] {
  const config = BRANCH_SLOTS_CONFIG[branchName] || BRANCH_SLOTS_CONFIG["default"];
  return WEEKDAY_DAYS.includes(day as (typeof WEEKDAY_DAYS)[number]) ? config.weekday : config.weekend;
}

const SELECT_ARROW_WHITE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L1 3h10z'/%3E%3C/svg%3E";
const SELECT_ARROW_DARK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235f6368' d='M6 8L1 3h10z'/%3E%3C/svg%3E";

function isAdminSlot(slot: string, branchName: string) {
  if (branchName === "Subang Taipan") return ["4:15 PM", "10:00 PM"].includes(slot);
  return ["5:00 PM", "10:00 PM", "08:45 AM – 09:15 AM", "11:45 AM – 12:00 PM", "2:30 PM – 2:45 PM", "5:15 PM – 5:30 PM", "6:45 PM – 7:15 PM"].includes(slot);
}

function getSlotWeight(day: string, slot: string, branchName: string): number {
  if (isAdminSlot(slot, branchName)) {
    if (branchName === "Subang Taipan") return 0.25;
    if (slot === "5:00 PM" || slot === "10:00 PM") return 0.25;
    if (["08:45 AM – 09:15 AM", "6:45 PM – 7:15 PM"].includes(slot)) return 0.5;
    return 0.25;
  }
  return 1.25;
}

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startDateStr = searchParams.get("start");
  const endDateStr = searchParams.get("end");

  // --- 1. ALL HOOKS MUST BE HERE (TOP LEVEL) ---
  const [mode, setMode] = useState<"hub" | "new" | "overview">("hub");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [hasConfirmedBranch, setHasConfirmedBranch] = useState(false);
  const [hasConfirmedWeek, setHasConfirmedWeek] = useState(!!startDateStr);
  const [isLocked, setIsLocked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filterBranch, setFilterBranch] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  
  const [editingDays, setEditingDays] = useState<Record<string, boolean>>(
    DAYS.reduce((acc, day) => ({ ...acc, [day]: true }), {})
  );
  const [showRestRows, setShowRestRows] = useState<Record<string, boolean>>(
    DAYS.reduce((acc, day) => ({ ...acc, [day]: false }), {})
  );

  // Load history data at the top
  const history = useMemo(() => {
    if (typeof window !== "undefined") {
      return JSON.parse(localStorage.getItem("manpower_history") || "[]");
    }
    return [];
  }, []);

  // Filter the history list based on dropdowns
  const filteredHistory = useMemo(() => {
    return history.filter((record: any) => {
      const matchesBranch = filterBranch === "" || record.branch === filterBranch;
      const matchesMonth = filterMonth === "" || format(parseISO(record.startDate), "yyyy-MM") === filterMonth;
      return matchesBranch && matchesMonth;
    });
  }, [history, filterBranch, filterMonth]);

  // --- 2. EFFECTS & LOGIC ---

  useEffect(() => {
    setHasConfirmedWeek(!!startDateStr);
  }, [startDateStr]);

  useEffect(() => {
    if (startDateStr) {
      const archivedRecord = history.find((h: any) => h.startDate === startDateStr && (mode === "overview" || h.branch === selectedBranch));
      if (archivedRecord) {
        setSelections(archivedRecord.selections);
        setNotes(archivedRecord.notes);
        setSelectedBranch(archivedRecord.branch);
        setIsLocked(true);
        setEditingDays(DAYS.reduce((acc, day) => ({ ...acc, [day]: false }), {}));
      } else if (mode === "new") {
        const savedDraft = localStorage.getItem(`manpower_draft_${selectedBranch}_${startDateStr}`);
        setSelections(savedDraft ? JSON.parse(savedDraft) : {});
        setIsLocked(false);
      }
    }
  }, [startDateStr, mode, selectedBranch, history]);

  useEffect(() => {
    if (startDateStr && mode === "new" && !isLocked) {
      localStorage.setItem(`manpower_draft_${selectedBranch}_${startDateStr}`, JSON.stringify(selections));
    }
  }, [selections, startDateStr, selectedBranch, mode, isLocked]);

  const weekLabel = useMemo(() => {
    if (!startDateStr || !endDateStr) return "";
    return `${format(parseISO(startDateStr), "MMM d")} – ${format(parseISO(endDateStr), "MMM d, yyyy")}`;
  }, [startDateStr, endDateStr]);

  // --- 3. HANDLERS ---

  const handleNameSelect = (day: string, time: string, columnId: ColumnId, name: string) => {
    if (isLocked) return;
    setSelections((prev) => ({ ...prev, [`${day}-${time}-${columnId}`]: name }));
  };

  const handleNoteChange = (day: string, time: string, value: string) => {
    if (isLocked) return;
    setNotes((prev) => ({ ...prev, [`${day}-${time}-notes`]: value }));
  };

  const clearAllForDay = (day: string) => {
    if (isLocked) return;
    if (window.confirm(`Are you sure you want to clear all selections for ${day}?`)) {
      setSelections((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => { if (key.startsWith(`${day}-`)) delete next[key]; });
        return next;
      });
      setNotes((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => { if (key.startsWith(`${day}-`)) delete next[key]; });
        return next;
      });
    }
  };

  const clearColumnForDay = (day: string, columnId: string) => {
    if (isLocked) return;
    setSelections((prev) => {
      const next = { ...prev };
      getTimeSlotsForDay(day, selectedBranch).forEach(slot => { delete next[`${day}-${slot}-${columnId}`]; });
      return next;
    });
  };

  const handleFinalSubmit = () => {
  const isUpdate = isLocked; // If it's already locked, we are in "Edit Mode"
  const confirmMsg = isUpdate 
    ? "Save changes to this archived schedule?" 
    : "Final Submit? This will lock the schedule and save it to the Archive Overview.";

  if (window.confirm(confirmMsg)) {
    const scheduleId = `${selectedBranch}_${startDateStr}`;
    const snapshot = {
      id: scheduleId,
      branch: selectedBranch,
      startDate: startDateStr,
      endDate: endDateStr,
      selections: selections,
      notes: notes,
      submittedAt: new Date().toISOString(),
      lastUpdated: isUpdate ? new Date().toISOString() : null,
    };

    const history = JSON.parse(localStorage.getItem("manpower_history") || "[]");
    // This filter + spread ensures we replace the old version with the new one
    const updatedHistory = [snapshot, ...history.filter((h: any) => h.id !== scheduleId)];
    
    localStorage.setItem("manpower_history", JSON.stringify(updatedHistory));
    
    setIsLocked(true);
    setEditingDays(DAYS.reduce((acc, day) => ({ ...acc, [day]: false }), {}));
    alert(isUpdate ? "Schedule Updated!" : "Schedule Submitted and Archived!");
  }
};

  const calculateStaffHours = () => {
    const staffStats: Record<string, { coachHrs: number; execHrs: number; total: number; assignedSlots: number }> = {};
    SHARED_EMPLOYEES.forEach(emp => { staffStats[emp] = { coachHrs: 0, execHrs: 0, total: 0, assignedSlots: 0 }; });
    DAYS.forEach((day) => {
      getTimeSlotsForDay(day, selectedBranch).forEach((slot) => {
        const weight = getSlotWeight(day, slot, selectedBranch);
        COLUMNS.forEach((col) => {
          const selectedName = selections[`${day}-${slot}-${col.id}`];
          if (selectedName && staffStats[selectedName]) {
            staffStats[selectedName].assignedSlots += 1;
            staffStats[selectedName].total += weight;
            if (col.type === "coach") staffStats[selectedName].coachHrs += weight;
            else if (col.type === "executive") staffStats[selectedName].execHrs += weight;
          }
        });
      });
    });
    return Object.entries(staffStats).map(([name, stats]) => ({ name, ...stats }));
  };

  // --- 4. SUB-COMPONENTS (DISPLAY) ---

  const SummaryTable = ({ title, data }: { title: string, data: any[] }) => {
    const formatTime = (d: number) => {
      const h = Math.floor(d);
      const m = Math.round((d - h) * 60);
      return { h: h.toString(), m: m.toString().padStart(2, '0') };
    };
    return (
      <div className="mx-auto mt-12 w-full max-w-[95%] overflow-hidden rounded-[15px] border border-[#e0e2e6]/70 bg-white shadow-lg text-slate-800">
        <header className="border-b border-[#e8eaed] bg-white px-8 py-6 text-center">
          <h2 className="m-0 text-[1.4rem] font-semibold text-[#1a1d23]">{title}</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-[0.9rem]">
            <thead>
              <tr>
                <th className="w-[60px] border border-[#e0e2e6] bg-[#2c3e50] p-4 text-white font-semibold text-center">No.</th>
                <th className="w-[250px] border border-[#e0e2e6] bg-[#2c3e50] p-4 text-white font-semibold text-left">Name</th>
                <th className="w-[240px] border border-[#e0e2e6] bg-[#2c3e50] p-4 text-white font-semibold text-center">Class (Coach)</th>
                <th className="w-[240px] border border-[#e0e2e6] bg-[#2c3e50] p-4 text-white font-semibold text-center">Executive</th>
                <th className="w-[240px] border border-[#e0e2e6] bg-[#2c3e50] p-4 text-white font-semibold text-center">Total (hrs:min)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => {
                const c = formatTime(row.coachHrs);
                const e = formatTime(row.execHrs);
                const t = formatTime(row.total);
                return (
                  <tr key={row.name} className="even:bg-[#fafbfc] hover:bg-[#f0f4f8]">
                    <td className="border border-[#e0e2e6] px-4 py-4 text-center text-slate-900">{index + 1}</td>
                    <td className="border border-[#e0e2e6] px-4 py-4 font-semibold text-slate-900 truncate">{row.name}</td>
                    {[c, e, t].map((time, i) => (
                      <td key={i} className={`border border-[#e0e2e6] px-2 py-4 ${i === 2 ? 'bg-slate-50/50' : ''}`}>
                        <div className="flex flex-row gap-4 items-center justify-center">
                          <div className="flex items-center gap-1">
                            <div className={`w-10 h-8 flex items-center justify-center border rounded bg-white text-sm shadow-sm font-medium border-slate-300`}>{time.h}</div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">hrs</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className={`w-10 h-8 flex items-center justify-center border rounded bg-white text-sm shadow-sm font-medium border-slate-300`}>{time.m}</div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">min</span>
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // --- 5. PAGE VIEWS ---

  if (mode === "hub") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500 text-slate-800">
          <div onClick={() => setMode("overview")} className="bg-white p-10 rounded-3xl shadow-xl border-4 border-transparent hover:border-blue-500 cursor-pointer transition-all flex flex-col items-center text-center group">
            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 text-3xl group-hover:bg-blue-600 group-hover:text-white transition-all">📊</div>
            <h2 className="text-2xl font-bold tracking-tight">ARCHIVE OVERVIEW</h2>
            <p className="text-gray-500 mt-3 text-sm">View and track your previous submitted schedules.</p>
          </div>
          <div onClick={() => setMode("new")} className="bg-white p-10 rounded-3xl shadow-xl border-4 border-transparent hover:border-green-500 cursor-pointer transition-all flex flex-col items-center text-center group">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mb-6 text-3xl group-hover:bg-green-600 group-hover:text-white transition-all">✍️</div>
            <h2 className="text-2xl font-bold tracking-tight">PLAN NEW WEEK</h2>
            <p className="text-gray-500 mt-3 text-sm">Start a fresh manpower schedule for your branch.</p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "new" && !hasConfirmedBranch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 relative">
        <button onClick={() => setMode("hub")} className="absolute top-8 left-8 text-blue-600 font-bold hover:underline">← Back</button>
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center text-slate-800">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-8 tracking-tighter uppercase">Select Branch</h1>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 outline-none mb-6 font-bold text-slate-700">
            <option value="">-- Choose Branch --</option>
            {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button disabled={!selectedBranch} onClick={() => setHasConfirmedBranch(true)} className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:bg-gray-300">Start Planning</button>
        </div>
      </div>
    );
  }

  if (!hasConfirmedWeek) {
    if (mode === "overview") {
      return (
        <div className="min-h-screen bg-gray-50 p-12 text-slate-800">
          <button onClick={() => setMode("hub")} className="mb-10 text-blue-600 font-bold hover:underline">← Back to Hub</button>
          
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
              <div>
                <h1 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Archive Records</h1>
                <p className="text-slate-500 font-medium">Search and filter through previous manpower schedules.</p>
              </div>

              <div className="flex gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-1">Branch</label>
                  <select 
                    value={filterBranch} 
                    onChange={(e) => setFilterBranch(e.target.value)}
                    className="bg-slate-50 border-none rounded-lg text-sm font-bold p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Branches</option>
                    {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-1">Month</label>
                  <input 
                    type="month" 
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="bg-slate-50 border-none rounded-lg text-sm font-bold p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button onClick={() => {setFilterBranch(""); setFilterMonth("");}} className="self-end p-2 px-4 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-black uppercase transition-colors">Reset</button>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="bg-white p-20 rounded-3xl border-2 border-dashed border-slate-200 text-center text-slate-400 font-bold uppercase tracking-widest text-xl">
                {history.length === 0 ? "No historical records found." : `No records added yet for ${filterBranch || 'this selection'}.`}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredHistory.map((record: any) => (
                  <div key={record.id} onClick={() => router.push(`/manpower-schedule?start=${record.startDate}&end=${record.endDate}`)} className="bg-white p-6 rounded-[25px] shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-xl cursor-pointer transition-all flex justify-between items-center group">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-[18px] flex items-center justify-center text-xl group-hover:bg-blue-600 group-hover:text-white transition-all">📋</div>
                      <div>
                        <h3 className="font-black text-slate-800 text-lg uppercase tracking-tighter leading-tight">{record.branch}</h3>
                        <p className="text-xs text-slate-500 font-bold">Week: {format(parseISO(record.startDate), "MMM do")} - {format(parseISO(record.endDate), "MMM do, yyyy")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className="text-blue-600 font-black text-[10px] uppercase tracking-widest group-hover:translate-x-1 transition-transform inline-block">View →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 relative pt-20 text-slate-800">
        <button onClick={() => setHasConfirmedBranch(false)} className="absolute top-8 left-8 text-blue-600 font-bold hover:underline">← Back</button>
        <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Select Planning Week</h1>
        </div>
        <WeekSelector onConfirm={(wd) => router.push(`/manpower-schedule?${wd}`)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-slate-800">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="flex justify-between items-center px-4 py-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { setMode("hub"); router.push('/manpower-schedule'); }} className="text-2xl hover:scale-110 transition-transform">🏠</button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight uppercase">{mode === "overview" ? "Historical Data" : "Manpower Planning"}</h1>
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase border border-white/30 tracking-widest">{selectedBranch}</span>
              </div>
              <p className="text-blue-100 mt-1 italic font-medium">{weekLabel ? `Schedule for ${weekLabel}` : ""}</p>
            </div>
          </div>
          <UserHeader userName="Admin User" userRole="SUPER_ADMIN" userEmail="admin@ebright.com" />
        </div>
      </header>

      <div className="flex h-[calc(100vh-100px)]">
        <Sidebar sidebarOpen={sidebarOpen} onCollapse={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto px-8 py-8 bg-gradient-to-br from-[#f0f4f8] to-[#d2dce9]">
          
          {isLocked && (
            <div className="mb-8 bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center shadow-xl border-2 border-white/10 animate-in slide-in-from-top duration-500">
              <div className="flex items-center gap-3">
                <span className="text-xl">🔒</span>
                <span className="font-bold uppercase tracking-widest text-sm">Archived Record (Read-Only)</span>
              </div>
              <button 
                onClick={() => setIsLocked(false)} 
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-black text-xs uppercase tracking-tighter transition-all"
              >
                Edit / Make Adjustments
              </button>
            </div>
          )}

          {DAYS.map((day) => {
            const isEditing = !!editingDays[day] && !isLocked;
            let currentDayDate = "";
            if (startDateStr) {
              const dayMap: Record<string, number> = { "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6 };
              const date = addDays(parseISO(startDateStr), dayMap[day]);
              currentDayDate = format(date, "EEEE, MMMM do");
            }
            return (
              <div key={day} className="mx-auto mb-10 w-full max-w-[95%] overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-xl">
                <header className="border-b bg-white px-8 py-6 flex justify-between items-center">
                  <div>
                    <h1 className="text-[1.5rem] font-black text-slate-800 uppercase tracking-tighter">{day}</h1>
                    <p className="text-[0.9rem] text-slate-500 font-bold italic">{currentDayDate}</p>
                  </div>
                  <div className="flex items-center gap-6 text-blue-600 text-xs font-black uppercase tracking-widest">
                    <button onClick={() => clearAllForDay(day)} disabled={!isEditing || isLocked} className="text-red-600 hover:text-red-700 disabled:opacity-0 transition-opacity font-bold">Clear All</button>
                    <button onClick={() => setShowRestRows(prev => ({ ...prev, [day]: !prev[day] }))} className="hover:underline">{showRestRows[day] ? 'Hide Rest' : 'Show Rest'}</button>
                  </div>
                </header>
                <div className="w-full overflow-x-auto max-h-[70vh]">
                  <table className="border-separate border-spacing-0 table-fixed" style={{ width: '2350px' }}>
                    <thead className="sticky top-0 z-40 bg-white shadow-md">
                      <tr>
                        <th className="sticky left-0 top-0 z-50 w-[250px] bg-[#2c3e50] text-white p-4 text-left border border-slate-600 uppercase font-black text-sm">Time Slot</th>
                        {COLUMNS.map((col) => (
                          <th key={col.id} className="w-[180px] bg-[#34495e] text-white p-3 border border-slate-600 text-center uppercase text-xs font-black">
                            <div className="flex flex-col gap-2 items-center">
                                {col.label}
                                {isEditing && <button onClick={() => clearColumnForDay(day, col.id)} className="text-[9px] text-red-300 font-bold hover:text-red-500 uppercase tracking-widest mt-1 bg-black/20 px-2 py-0.5 rounded-full">[Clear]</button>}
                            </div>
                          </th>
                        ))}
                        <th className="w-[300px] bg-[#34495e] text-white p-4 uppercase font-black text-sm">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getTimeSlotsForDay(day, selectedBranch)
                      .filter(slot => !isAdminSlot(slot, selectedBranch) || showRestRows[day])
                      .map((slot) => {
                        const selectedInRow = COLUMNS.map(col => selections[`${day}-${slot}-${col.id}`]).filter(Boolean);
                        return (
                          <tr key={slot} className={`hover:bg-blue-50/50 ${isAdminSlot(slot, selectedBranch) ? 'bg-gray-100' : ''}`}>
                            <td className="sticky left-0 z-20 w-[250px] bg-white border p-4 font-black text-slate-700 shadow-sm">{slot}</td>
                            {COLUMNS.map((col) => {
                              const selectedName = selections[`${day}-${slot}-${col.id}`] || "";
                              const selectStyles = selectedName ? (EMPLOYEE_COLORS[selectedName] || "bg-blue-400 text-white shadow-sm") : "bg-gray-50 text-gray-400";
                              return (
                                <td key={col.id} className="p-3 border w-[180px]">
                                  <select disabled={!isEditing} value={selectedName} onChange={(e) => handleNameSelect(day, slot, col.id, e.target.value)} className={`w-full appearance-none rounded-md border py-2.5 text-sm text-center outline-none ${selectStyles} font-bold shadow-sm transition-all`} style={{ backgroundImage: `url("${selectedName ? SELECT_ARROW_WHITE : SELECT_ARROW_DARK}")`, backgroundPosition: "right 0.6rem center", backgroundRepeat: "no-repeat", textAlignLast: "center" }}>
                                    <option value="">None</option>
                                    {SHARED_EMPLOYEES.map(name => <option key={name} value={name} disabled={selectedInRow.includes(name) && selectedName !== name}>{name}</option>)}
                                  </select>
                                </td>
                              );
                            })}
                            <td className="p-3 border w-[300px]">
                              <textarea disabled={!isEditing} className="w-full text-sm outline-none bg-transparent resize-none font-medium italic text-slate-600" rows={2} value={notes[`${day}-${slot}-notes`] || ""} onChange={(e) => handleNoteChange(day, slot, e.target.value)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="p-6 flex justify-end bg-gray-50 border-t">
                  {!isLocked && (isEditing ? <button onClick={() => setEditingDays(p => ({...p, [day]: false}))} className="bg-blue-600 text-white px-8 py-2 rounded-lg font-black uppercase tracking-widest shadow-lg">Save Day</button> : <button onClick={() => setEditingDays(p => ({...p, [day]: true}))} className="text-blue-600 font-black border-2 border-blue-600 px-8 py-2 rounded-lg uppercase tracking-widest hover:bg-blue-50 transition-all">Edit Day</button>)}
                </div>
              </div>
            );
          })}
          
          <SummaryTable title="Staff Assignments Summary" data={calculateStaffHours()} />
          
          {/* This will now show up for NEW plans AND when you unlock an ARCHIVE */}
          {!isLocked && (
            <div className="mt-16 mb-24 flex flex-col items-center gap-6 animate-in slide-in-from-bottom duration-700">
              <div className="h-[2px] w-full bg-slate-300 max-w-4xl"></div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
                {mode === "overview" ? "Update Archived Schedule" : "Submit Final Schedule"}
              </h2>
              <button 
                onClick={handleFinalSubmit} 
                className="bg-green-600 hover:bg-green-700 text-white px-24 py-5 rounded-2xl text-2xl font-black shadow-2xl transition-all transform hover:scale-105 active:scale-95 border-4 border-green-900/20"
              >
                {mode === "overview" ? "💾 SAVE ADJUSTMENTS" : "🚀 FINAL SUBMIT & ARCHIVE"}
              </button>
              {mode === "overview" && (
                <button 
                  onClick={() => setIsLocked(true)} 
                  className="text-slate-500 font-bold hover:underline"
                >
                  Cancel and Discard Changes
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}