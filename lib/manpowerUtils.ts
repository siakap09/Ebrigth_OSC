export const SHARED_EMPLOYEES: string[] = [];

export const ALL_BRANCHES = [
  "Subang Taipan", "Setia Alam", "Shah Alam", "Putrajaya", "Ampang", 
  "Cyberjaya", "Klang", "Bandar Baru Bangi", "Taman Sri Gombak", 
  "Online", "Kajang TTDI Groove", "Kota Warisan", "Bandar Tun Hussein Onn", 
  "Danau Kota", "Denai Alam", "Sri Petaling", "Eco Grandeur", 
  "Kota Damansara", "Bandar Seri Putra", "Rimbayu"
].sort();

export const DAYS = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAY_DAYS = ["Wednesday", "Thursday", "Friday"] as const;

// Online-branch pay rule.
//
// Online-branch coaches are paid purely on the hours they actually coach — they
// have no exec/admin hours, so their exec time should always be 0. The standard
// branches instead top each working day up to a daily target with "exec" hours
// (dailyTarget − coachHrs).
//
// Two people are exempt and keep the standard coach+exec calculation:
//   77000093 — Pooja (PT): counts both coach and exec hours.
//   66020086 — Amin (FT): also counts exec (as FT he yields no pay anyway).
export const ONLINE_EXEC_EXEMPT_EMPLOYEE_IDS = new Set(["77000093", "66020086"]);

/**
 * True when this staff member is an Online-branch coach paid on coaching hours
 * only (no exec hours) — i.e. the branch is Online and they are not one of the
 * exempt employee IDs above. `branch` must already be the full name "Online".
 */
export function isOnlineCoachOnly(
  branch: string | null | undefined,
  employeeId: string | null | undefined,
): boolean {
  if ((branch ?? "").trim().toLowerCase() !== "online") return false;
  return !ONLINE_EXEC_EXEMPT_EMPLOYEE_IDS.has((employeeId ?? "").trim());
}

export const BRANCH_WORKING_DAYS: Record<string, string[]> = {
  "Ampang": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Bandar Seri Putra": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Klang": ["Thursday", "Friday", "Saturday", "Sunday"],
  "Rimbayu": ["Saturday", "Sunday"],
  "Kota Warisan": ["Saturday", "Sunday"],
  "Setia Alam": ["Thursday", "Friday", "Saturday", "Sunday"],
};

export function getWorkingDaysForBranch(branchName: string): string[] {
  return BRANCH_WORKING_DAYS[branchName] ?? [...DAYS];
}

// --- COLOR LOGIC ---
const COLOR_PALETTE = [
  "bg-red-600 text-white",
  "bg-orange-500 text-white",
  "bg-amber-500 text-black",
  "bg-green-600 text-white",
  "bg-emerald-500 text-white",
  "bg-teal-600 text-white",
  "bg-cyan-600 text-white",
  "bg-sky-600 text-white",
  "bg-blue-600 text-white",
  "bg-indigo-600 text-white",
  "bg-violet-600 text-white",
  "bg-purple-600 text-white",
  "bg-fuchsia-600 text-white",
  "bg-pink-600 text-white",
  "bg-rose-600 text-white",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    // A slightly stronger hash to spread colors better
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getEmployeeColor(name: string): string {
  if (!name || name === "None" || name === "-- Select --") return "bg-white text-slate-400 border border-slate-200";
  const colorIndex = hashName(name) % COLOR_PALETTE.length;
  return COLOR_PALETTE[colorIndex];
}

export const STAFF_COLORS = [
  "bg-red-500 text-white", "bg-orange-500 text-white", "bg-amber-500 text-black",
  "bg-lime-600 text-white", "bg-green-600 text-white", "bg-emerald-500 text-white",
  "bg-teal-600 text-white", "bg-cyan-600 text-white", "bg-sky-500 text-white",
  "bg-blue-600 text-white", "bg-indigo-600 text-white", "bg-violet-600 text-white",
  "bg-purple-600 text-white", "bg-fuchsia-600 text-white", "bg-pink-600 text-white",
  "bg-rose-600 text-white", "bg-red-700 text-white", "bg-orange-700 text-white",
  "bg-yellow-600 text-white", "bg-green-700 text-white", "bg-teal-700 text-white",
  "bg-blue-700 text-white", "bg-indigo-700 text-white", "bg-violet-700 text-white",
  "bg-pink-700 text-white", "bg-rose-700 text-white", "bg-cyan-700 text-white",
  "bg-sky-700 text-white", "bg-emerald-700 text-white", "bg-purple-700 text-white",
];

export function getStaffColorByIndex(name: string, staffList: string[]): string {
  if (!name || name === "None") return "bg-white border border-slate-200 text-slate-400";
  const idx = staffList.indexOf(name);
  if (idx >= 0) return STAFF_COLORS[idx % STAFF_COLORS.length];
  return getEmployeeColor(name);
}

// --- TABLE CONFIGURATION ---
export const COLUMNS = [
  { id: "coach1", label: "Coach 1", type: "coach" as const },
  { id: "coach2", label: "Coach 2", type: "coach" as const },
  { id: "coach3", label: "Coach 3", type: "coach" as const },
  { id: "coach4", label: "Coach 4", type: "coach" as const },
  { id: "coach5", label: "Coach 5", type: "coach" as const },
  { id: "exec1", label: "Exec 1", type: "exec" as const },
  { id: "exec2", label: "Exec 2", type: "exec" as const },
  { id: "exec3", label: "Exec 3", type: "exec" as const },
  { id: "exec4", label: "Exec 4", type: "exec" as const },
  { id: "exec5", label: "Exec 5", type: "exec" as const },
] as const;

const DEFAULT_WEEKDAY_TIME_SLOTS = ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"] as const;
const DEFAULT_WEEKEND_TIME_SLOTS = ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"] as const;
const TAIPAN_WEEKDAY_TIME_SLOTS = ["4:15 PM", "04.30PM - 05.45PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "10:00 PM"] as const;
const AMPANG_WEEKDAY_TIME_SLOTS = ["5:00 PM - 6:00 PM", "06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM", "9:45 PM - 10:00 PM"] as const;
const AMPANG_WEEKEND_TIME_SLOTS = ["8:45 AM - 9:15 AM", "09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM", "6:45 PM - 7:15 PM"] as const;

export const BRANCH_SLOTS_CONFIG: Record<string, { weekday: readonly string[], weekend: readonly string[] }> = {
  "Subang Taipan": { weekday: TAIPAN_WEEKDAY_TIME_SLOTS, weekend: DEFAULT_WEEKEND_TIME_SLOTS },
  "Ampang": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Bandar Seri Putra": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Klang": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "Setia Alam": { weekday: AMPANG_WEEKDAY_TIME_SLOTS, weekend: AMPANG_WEEKEND_TIME_SLOTS },
  "default": { weekday: DEFAULT_WEEKDAY_TIME_SLOTS, weekend: DEFAULT_WEEKEND_TIME_SLOTS }
};

const OPENING_CLOSING_SLOTS: Record<string, string[]> = {
  "Ampang": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Bandar Seri Putra": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Klang": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
  "Setia Alam": ["5:00 PM - 6:00 PM", "9:45 PM - 10:00 PM", "8:45 AM - 9:15 AM", "6:45 PM - 7:15 PM"],
};

export function isOpeningClosingSlot(slot: string, branchName: string): boolean {
  return (OPENING_CLOSING_SLOTS[branchName] ?? []).includes(slot);
}

export function getTimeSlotsForDay(day: string, branchName: string): readonly string[] {
  const config = BRANCH_SLOTS_CONFIG[branchName] || BRANCH_SLOTS_CONFIG["default"];
  return WEEKDAY_DAYS.includes(day as any) ? config.weekday : config.weekend;
}

export function isAdminSlot(slot: string, branchName: string) {
  if (branchName === "Subang Taipan") return ["4:15 PM", "10:00 PM"].includes(slot);
  return ["5:00 PM", "10:00 PM", "08:45 AM – 09:15 AM", "11:45 AM – 12:00 PM", "2:30 PM – 2:45 PM", "5:15 PM – 5:30 PM", "6:45 PM – 7:15 PM"].includes(slot);
}

const MANAGER_ON_DUTY_SLOTS: Record<string, { weekday: string[], weekend: string[] }> = {
  "Ampang": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Bandar Seri Putra": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Klang": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Setia Alam": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "Subang Taipan": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
  "default": {
    weekday: ["06.00PM - 07.15PM", "07:15PM - 08:30PM", "08.30PM - 09:45PM"],
    weekend: ["09:15 AM – 10:30 AM", "10:30 AM – 11:45 AM", "12:00 PM – 1:15 PM", "1:15 PM – 2:30 PM", "2:45 PM – 4:00 PM", "4:00 PM – 5:15 PM", "5:30 PM – 6:45 PM"],
  },
};

export function isManagerOnDutySlot(slot: string, branchName: string, day: string): boolean {
  const isWeekend = !WEEKDAY_DAYS.includes(day as any);
  const config = MANAGER_ON_DUTY_SLOTS[branchName] || MANAGER_ON_DUTY_SLOTS["default"];
  const allowedSlots = isWeekend ? config.weekend : config.weekday;
  return allowedSlots.includes(slot);
}

export const SELECT_ARROW_WHITE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L1 3h10z'/%3E%3C/svg%3E";
export const SELECT_ARROW_DARK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235f6368' d='M6 8L1 3h10z'/%3E%3C/svg%3E";