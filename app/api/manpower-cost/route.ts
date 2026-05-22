import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import {
  getWorkingDaysForBranch,
  getTimeSlotsForDay,
  isOpeningClosingSlot,
  isAdminSlot,
  COLUMNS,
} from "@/lib/manpowerUtils";
import { isEmployee, isBranchManager, isAcademy } from "@/lib/roles";
import { normalizeLocation } from "@/lib/constants";

const EXECUTIVE_RATE = 11;

interface DailyHour {
  day: string;
  coachHrs: number;
  execHrs: number;
  totalHrs: number;
  classCount: number;
}

interface StaffHourEntry {
  name: string;
  branch: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  coachHrs: number;
  execHrs: number;
  totalHrs: number;
  classCount: number;
  dailyBreakdown: DailyHour[];
}

type StaffRecord = {
  id: number;
  name: string | null;
  nickname: string | null;
  branch: string | null;
  position: string | null;
  role: string | null;
  employment_type: string | null;
  rate: string | null;
  email: string | null;
};

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

/**
 * Compare two branch labels for equivalence. Schedules use full names
 * ("Rimbayu", "Setia Alam") while BranchStaff often uses short codes
 * ("RBY", "SA"). normalizeLocation maps codes → full names; we then accept
 * an exact match or a substring match either way ("Rimbayu" ⊂ "Bandar Rimbayu").
 */
function branchesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  const fa = norm(normalizeLocation(a));
  const fb = norm(normalizeLocation(b));
  if (fa === fb) return true;
  if (fa && fb && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}

function calculateHoursFromSelections(
  selections: Record<string, string>,
  branch: string
): Record<string, { coachHrs: number; execHrs: number; totalHrs: number; classCount: number; dailyBreakdown: DailyHour[] }> {
  const allNames = new Set<string>();
  Object.values(selections).forEach((val) => {
    if (val && val !== "" && val !== "None") allNames.add(val);
  });

  const staffStats: Record<string, { coachHrs: number; execHrs: number; totalHrs: number; classCount: number; dailyBreakdown: DailyHour[] }> = {};
  allNames.forEach((name) => {
    staffStats[name] = { coachHrs: 0, execHrs: 0, totalHrs: 0, classCount: 0, dailyBreakdown: [] };
  });

  getWorkingDaysForBranch(branch).forEach((day) => {
    const isWeekend = day === "Saturday" || day === "Sunday";
    const dailyTarget = isWeekend ? 10.5 : 5.0;

    allNames.forEach((emp) => {
      let coachingHoursForDay = 0;
      let classesForDay = 0;
      let workedThatDay = false;

      getTimeSlotsForDay(day, branch).forEach((slot) => {
        if (isOpeningClosingSlot(slot, branch)) return;
        COLUMNS.forEach((col) => {
          if (selections[`${day}-${slot}-${col.id}`] === emp) {
            workedThatDay = true;
            const isAdmin = isAdminSlot(slot, branch);
            const slotDuration = isAdmin ? 0.25 : 1.25;
            if (col.type === "coach") {
              coachingHoursForDay += slotDuration;
              // A "class" is a regular (non-admin) coach slot — admin slots are
              // short housekeeping blocks (0.25h) where no class is taught.
              if (!isAdmin) classesForDay += 1;
            }
          }
        });
      });

      if (workedThatDay) {
        const execHrs = Math.max(0, dailyTarget - coachingHoursForDay);
        staffStats[emp].coachHrs += coachingHoursForDay;
        staffStats[emp].execHrs += execHrs;
        staffStats[emp].totalHrs = staffStats[emp].coachHrs + staffStats[emp].execHrs;
        staffStats[emp].classCount += classesForDay;
        staffStats[emp].dailyBreakdown.push({
          day,
          coachHrs: coachingHoursForDay,
          execHrs,
          totalHrs: coachingHoursForDay + execHrs,
          classCount: classesForDay,
        });
      }
    });
  });

  return staffStats;
}

/**
 * Resolve a slot value (a name string written into ManpowerSchedule.selections)
 * to a single BranchStaff record. Tries exact name/nickname match first, then
 * substring matching to handle short-form names (e.g. slot says "Diena", staff
 * record is "NUR IRDIENA BATRISYIA BINTI ASMAWI" with nickname "IRDIENA").
 *
 * When more than one candidate matches a key (e.g. two staff share nickname
 * "IQBAL"), prefer the one whose home branch matches the schedule's branch.
 */
function buildStaffResolver(allStaff: StaffRecord[]) {
  // Allow multiple candidates per name/nickname key — many staff share short
  // nicknames like "IQBAL" or "LUQMANUL", so we can't first-write-wins.
  const byKey: Record<string, StaffRecord[]> = {};
  const push = (key: string, s: StaffRecord) => {
    const list = (byKey[key] ||= []);
    if (!list.includes(s)) list.push(s);
  };
  for (const s of allStaff) {
    if (s.name) push(norm(s.name), s);
    if (s.nickname) push(norm(s.nickname), s);
  }

  return (rawName: string, scheduleBranch: string): StaffRecord | null => {
    const key = norm(rawName);
    if (!key) return null;

    const exact = byKey[key];
    if (exact && exact.length > 0) {
      if (exact.length === 1) return exact[0];
      const branchMatch = exact.find((s) => branchesMatch(s.branch, scheduleBranch));
      if (branchMatch) return branchMatch;
      // Otherwise fall through and let substring matching try harder.
    }

    const candidates = allStaff.filter((s) => {
      const n = norm(s.name);
      const nk = norm(s.nickname);
      if (n && (n === key || n.includes(key) || key.includes(n))) return true;
      if (nk && (nk === key || nk.includes(key) || key.includes(nk))) return true;
      return false;
    });

    if (candidates.length === 0) return exact?.[0] ?? null;
    if (candidates.length === 1) return candidates[0];

    const branchMatch = candidates.find((s) => branchesMatch(s.branch, scheduleBranch));
    return branchMatch ?? candidates[0];
  };
}

/**
 * For an authenticated PT/FT user, resolve which BranchStaff record represents
 * them. Tries email first (the only reliable join), then falls back to matching
 * User.name / User.branchName against BranchStaff.name and BranchStaff.nickname
 * (including substring matching).
 */
function resolveLoggedInStaff(
  allStaff: StaffRecord[],
  sessionEmail: string | null | undefined,
  sessionName: string | null | undefined,
  sessionBranchName: string | null | undefined
): StaffRecord | null {
  const email = norm(sessionEmail);
  if (email) {
    const byEmail = allStaff.find((s) => norm(s.email) === email);
    if (byEmail) return byEmail;
  }

  const candidates = [norm(sessionName), norm(sessionBranchName)].filter(Boolean);
  for (const c of candidates) {
    const exact = allStaff.find((s) => norm(s.name) === c || norm(s.nickname) === c);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const sub = allStaff.find((s) => {
      const n = norm(s.name);
      const nk = norm(s.nickname);
      if (n && (n.includes(c) || c.includes(n))) return true;
      if (nk && (nk.includes(c) || c.includes(nk))) return true;
      return false;
    });
    if (sub) return sub;
  }
  return null;
}

function isPartTimeStaff(staff: StaffRecord): boolean {
  const fields = [staff.position, staff.role, staff.employment_type]
    .map((f) => (f ?? "").toUpperCase());
  return fields.some(
    (f) =>
      f.startsWith("PT") ||
      f.includes("PT -") ||
      f.includes("PART-TIME") ||
      f.includes("PART TIME"),
  );
}

function shouldExcludeStaff(staff: StaffRecord): boolean {
  const pos = (staff.position || staff.role || "").toUpperCase();
  const name = (staff.name || "").toUpperCase();
  if (pos.includes("BRANCH MANAGER")) return true;
  if (pos.includes("INTERN")) return true;
  if (name.includes("(TRAINING)")) return true;
  return false;
}

/**
 * GET /api/manpower-cost?month=2026-04
 *
 * Returns staff hours + cost data by parsing ManpowerSchedule selections and
 * resolving each slot value to a BranchStaff record (the single source of
 * truth for employee identity, branch, role, and rate).
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    const sessionUser = auth.session.user as any;
    const userRole = sessionUser?.role || "";
    const isEmployeeView = isEmployee(userRole);

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month parameter required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    const [year, mon] = month.split("-");
    const monthStart = `${year}-${mon}-01`;
    const nextMonth = Number(mon) === 12
      ? `${Number(year) + 1}-01-01`
      : `${year}-${String(Number(mon) + 1).padStart(2, "0")}-01`;

    // Include any schedule whose week OVERLAPS the requested month — not just
    // ones whose startDate falls inside it. Weeks routinely span a month
    // boundary (e.g. Apr 30 – May 6), and the previous "startDate in month"
    // filter dropped those entirely for the second month, causing May 2 / 3
    // to be missing for everyone who only worked on the cross-boundary week.
    // The per-day filter below trims the days back to the requested month.
    const schedules = await prisma.manpowerSchedule.findMany({
      where: {
        AND: [
          { startDate: { lt: nextMonth } },
          { endDate: { gte: monthStart } },
        ],
        status: "Finalized",
      },
      orderBy: { startDate: "asc" },
    });

    // Source of truth: BranchStaff table only.
    const allStaff: StaffRecord[] = await prisma.branchStaff.findMany({
      select: {
        id: true,
        name: true,
        nickname: true,
        branch: true,
        position: true,
        role: true,
        employment_type: true,
        rate: true,
        email: true,
      },
    });

    const resolveStaff = buildStaffResolver(allStaff);

    // Resolve the logged-in employee (if any) to a single BranchStaff id, so we
    // can filter the final results to that one person. Fail closed: if we can't
    // resolve, return nothing for an employee user.
    let loggedInStaffId: number | null = null;
    if (isEmployeeView) {
      const me = resolveLoggedInStaff(
        allStaff,
        sessionUser?.email,
        sessionUser?.name,
        sessionUser?.branchName,
      );
      loggedInStaffId = me?.id ?? null;
    }

    const dayNameToDate = (dayName: string, startDate: string): string => {
      const dayMap: Record<string, number> = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
        Thursday: 4, Friday: 5, Saturday: 6,
      };
      const [sy, sm, sd] = startDate.split("-").map(Number);
      const start = new Date(sy, sm - 1, sd);
      const startDow = start.getDay();
      const targetDow = dayMap[dayName] ?? 0;
      let diff = targetDow - startDow;
      if (diff < 0) diff += 7;
      const result = new Date(sy, sm - 1, sd + diff);
      const yyyy = result.getFullYear();
      const mm = String(result.getMonth() + 1).padStart(2, "0");
      const dd = String(result.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const allEntries: StaffHourEntry[] = [];

    schedules.forEach((schedule: any) => {
      const selections = (schedule.selections || schedule.originalSelections || {}) as Record<string, string>;
      if (!selections || Object.keys(selections).length === 0) return;

      const stats = calculateHoursFromSelections(selections, schedule.branch);

      Object.entries(stats).forEach(([name, hours]) => {
        if (hours.totalHrs === 0) return;
        const dailyWithDates = hours.dailyBreakdown
          .map((d) => ({ ...d, date: dayNameToDate(d.day, schedule.startDate) }))
          .filter((d) => d.date >= monthStart && d.date < nextMonth);

        if (dailyWithDates.length === 0) return;

        const filteredCoachHrs = dailyWithDates.reduce((s, d) => s + d.coachHrs, 0);
        const filteredExecHrs = dailyWithDates.reduce((s, d) => s + d.execHrs, 0);
        const filteredClassCount = dailyWithDates.reduce((s, d) => s + (d.classCount || 0), 0);

        allEntries.push({
          name,
          branch: schedule.branch,
          weekLabel: `${schedule.startDate} - ${schedule.endDate}`,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          coachHrs: filteredCoachHrs,
          execHrs: filteredExecHrs,
          totalHrs: filteredCoachHrs + filteredExecHrs,
          classCount: filteredClassCount,
          dailyBreakdown: dailyWithDates,
        });
      });
    });

    // Aggregate by BranchStaff.id so name variants ("Diena" / "IRDIENA" /
    // "NUR IRDIENA BATRISYIA BINTI ASMAWI") collapse into one row.
    interface DailyEntry { date: string; day: string; coachHrs: number; execHrs: number; totalHrs: number; classCount: number; scheduleBranch?: string }

    const aggregated: Record<string, {
      key: string;
      staffId: number | null;
      name: string;
      branch: string;
      rate: number | null;
      employmentType: string | null;
      position: string | null;
      coachHrs: number;
      execHrs: number;
      totalHrs: number;
      classCount: number;
      coachPay: number;
      execPay: number;
      totalPay: number;
      days: DailyEntry[];
    }> = {};

    allEntries.forEach((entry) => {
      const staff = resolveStaff(entry.name, entry.branch);

      // Aggregation key: BranchStaff.id when resolved, otherwise raw name+branch.
      // Unresolved entries (slot value with no matching staff record) get their
      // own bucket so they remain visible rather than silently merging.
      const key = staff ? `staff:${staff.id}` : `raw:${norm(entry.name)}:::${norm(entry.branch)}`;

      // When matched, always show the BranchStaff full name and the friendly
      // branch label. BranchStaff.branch may be a short code ("RBY") — route
      // it through normalizeLocation so the UI displays "Bandar Rimbayu".
      const displayName = staff?.name || entry.name;
      const rawBranch = staff?.branch || entry.branch;
      const homeBranch = normalizeLocation(rawBranch) || rawBranch;
      const rate = staff?.rate ? parseFloat(staff.rate) || null : null;
      const position = staff?.position || staff?.role || null;
      const employmentType = staff?.employment_type || position;

      if (!aggregated[key]) {
        aggregated[key] = {
          key,
          staffId: staff?.id ?? null,
          name: displayName,
          branch: homeBranch,
          rate,
          employmentType,
          position,
          coachHrs: 0,
          execHrs: 0,
          totalHrs: 0,
          classCount: 0,
          coachPay: 0,
          execPay: 0,
          totalPay: 0,
          days: [],
        };
      }

      const bucket = aggregated[key];
      bucket.coachHrs += entry.coachHrs;
      bucket.execHrs += entry.execHrs;
      bucket.totalHrs += entry.totalHrs;
      bucket.classCount += entry.classCount;

      // Mark a day as a "replacement" only when the schedule branch is
      // genuinely different from the staff's home branch. Compare via
      // branchesMatch so "RBY" vs "Rimbayu" doesn't get tagged as a swap.
      const scheduleBranch = entry.branch;
      const isReplacement = !branchesMatch(scheduleBranch, bucket.branch);
      entry.dailyBreakdown.forEach((d: any) => {
        bucket.days.push({
          date: d.date,
          day: d.day,
          coachHrs: d.coachHrs,
          execHrs: d.execHrs,
          totalHrs: d.totalHrs,
          classCount: d.classCount || 0,
          scheduleBranch: isReplacement ? scheduleBranch : undefined,
        });
      });
    });

    Object.values(aggregated).forEach((emp) => {
      emp.days.sort((a, b) => a.date.localeCompare(b.date));
    });

    const results = Object.values(aggregated)
      .filter((emp) => {
        // Apply exclusion based on the resolved staff record when available.
        if (emp.staffId !== null) {
          const staff = allStaff.find((s) => s.id === emp.staffId);
          if (staff && shouldExcludeStaff(staff)) return false;
        }
        const pos = (emp.position || "").toUpperCase();
        const name = (emp.name || "").toUpperCase();
        if (pos.includes("BRANCH MANAGER")) return false;
        if (pos.includes("INTERN")) return false;
        if (name.includes("(TRAINING)")) return false;
        return true;
      })
      .map((emp) => {
        const staff = emp.staffId !== null ? allStaff.find((s) => s.id === emp.staffId) : null;
        const isPT = staff
          ? isPartTimeStaff(staff)
          : (() => {
              const roleStr = (emp.employmentType || emp.position || "").toUpperCase();
              return roleStr.startsWith("PT") || roleStr.includes("PT -") ||
                     roleStr.includes("PART-TIME") || roleStr.includes("PART TIME");
            })();

        const hasRate = emp.rate !== null && emp.rate > 0;
        const coachPay = isPT && hasRate ? emp.coachHrs * (emp.rate || 0) : 0;
        const execPay = isPT && hasRate ? emp.execHrs * EXECUTIVE_RATE : 0;

        return {
          ...emp,
          isPT,
          coachPay,
          execPay,
          totalPay: coachPay + execPay,
        };
      });

    // Role-based scoping. Fail closed: anything we can't resolve becomes [].
    //   FT / PT (isEmployeeView)   → own row only via loggedInStaffId.
    //   Branch Manager              → own branch only.
    //   Admin / HOD / HR / Academy → see everything (no filter).
    //   Executive / Intern / other → no pay data (fail closed).
    if (isEmployeeView) {
      // Employee self-view: filter to just the logged-in person's row by
      // BranchStaff.id. Fail closed if we couldn't resolve them.
      const filtered = loggedInStaffId === null
        ? []
        : results.filter((r) => r.staffId === loggedInStaffId);
      results.length = 0;
      results.push(...filtered);
    } else if (isBranchManager(userRole)) {
      const userBranch = sessionUser?.branchName as string | null | undefined;
      const filtered = userBranch
        ? results.filter((r) => r.branch === userBranch)
        : [];
      results.length = 0;
      results.push(...filtered);
    } else if (canSeeAllBranches(auth.session) || isAcademy(userRole)) {
      // No filter — caller sees all branches.
    } else {
      // Executive / Intern / unknown role → no pay-data access.
      results.length = 0;
    }

    results.sort((a, b) => {
      if (a.isPT !== b.isPT) return a.isPT ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const ptResults = results.filter((r) => r.isPT);
    const ftResults = results.filter((r) => !r.isPT);

    const totals = {
      totalStaff: results.length,
      ptCount: ptResults.length,
      ftCount: ftResults.length,
      totalCoachHrs: results.reduce((s, r) => s + r.coachHrs, 0),
      totalExecHrs: results.reduce((s, r) => s + r.execHrs, 0),
      totalHrs: results.reduce((s, r) => s + r.totalHrs, 0),
      totalClasses: results.reduce((s, r) => s + r.classCount, 0),
      totalCoachPay: ptResults.reduce((s, r) => s + r.coachPay, 0),
      totalExecPay: ptResults.reduce((s, r) => s + r.execPay, 0),
      totalPay: ptResults.reduce((s, r) => s + r.totalPay, 0),
      executiveRate: EXECUTIVE_RATE,
    };

    const weeksSet = new Set<string>();
    schedules.forEach((s: any) => {
      weeksSet.add(`${s.startDate}:::${s.endDate}`);
    });
    const availableWeeks = Array.from(weeksSet)
      .map((w) => { const [start, end] = w.split(":::"); return { start, end }; })
      .sort((a, b) => a.start.localeCompare(b.start));

    return NextResponse.json({
      success: true,
      month,
      totals,
      staff: results,
      isEmployeeView,
      availableWeeks,
    });
  } catch (error) {
    console.error("Manpower cost calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate manpower cost" },
      { status: 500 }
    );
  }
}
