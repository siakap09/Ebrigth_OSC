import { NextResponse } from "next/server";
import { Pool } from "pg";
import { prisma } from "@/lib/prisma";
import { requireRole, canSeeAllBranches } from "@/lib/auth";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { normalizeLocation } from "@/lib/constants";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function isWithinDays(dateStr: string, startDays: number, endDays: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const diff = (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= startDays && diff <= endDays;
}

// =============================================================================
// HARDCODED DATA for Onboarding, Offboarding, MC
// (will be replaced with database source later)
// =============================================================================

const onboardingRaw = [
  { name: "MUHAMMAD DENISE HAIQAL BIN SUHAIDI", position: "Full Time", dept: "Optimization", branch: "OD", date: "2026-04-11", employeeId: "440100238" },
  { name: "MUHAMMAD ALIF HAIQAL BIN ZULKIFLI", position: "Full Time", dept: "Human Resource", branch: "HR", date: "2026-04-11", employeeId: "440100237" },
  { name: "SHAMOOYA SURESAN", position: "Part Time", dept: "Sri Petaling", branch: "SP", date: "2026-04-11", employeeId: "330900252" },
  { name: "Amarapreet Saravanan", position: "Part Time", dept: "Tuition Taipan", branch: "TT", date: "2026-04-11", employeeId: "330900253" },
  { name: "NUR ALYA BINTI MOHD FAUZI", position: "Part Time", dept: "Shah Alam", branch: "SHA", date: "2026-04-11", employeeId: "330900254" },
  { name: "Gan De Wei", position: "Full Time", dept: "Marketing", branch: "MK", date: "2026-04-18", employeeId: "220100199" },
  { name: "NUR FELISHA BINTI SHALAHUDIN", position: "Part Time", dept: "Kota Warisan", branch: "KW", date: "2026-04-21", employeeId: "330900255" },
  { name: "SITI EISYAH BINTI SHEIKH HYLMYE", position: "Part Time", dept: "Damansara Kim", branch: "DK", date: "2026-04-28", employeeId: "330900256" },
  { name: "SOFIA ADLINA BINTI MOHAMMAD ALI", position: "Intern", dept: "Optimization", branch: "OD", date: "2026-05-05", employeeId: "440100239" },
  { name: "NURUL AZEYANNA BINTI ZULKIFLI", position: "Full Time", dept: "Optimization", branch: "OD", date: "2026-05-30", employeeId: "44080012" },
];

const offboardingRaw = [
  { name: "SALMAN AL-FARID BIN MOHD ROZI", position: "Intern", dept: "Optimization", branch: "OD", date: "2026-05-14", employeeId: "440100240" },
  { name: "ASHWIN A/L CHANDRA SAKARAN", position: "Intern", dept: "Optimization", branch: "OD", date: "2026-04-19", employeeId: "330900257" },
  { name: "FERRIS FABIANSYAH UMAR", position: "Intern", dept: "Optimization", branch: "OD", date: "2026-04-30", employeeId: "330900258" },
];

// MC data is now fetched from the MedicalLeave table (see below)

export async function GET() {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  // Branch Managers see only their own branch's HR activity. Admin/HOD see all.
  // We normalize both sides to canonical branch names so "KLG" / "Klang" /
  // "klang" all collapse to the same key.
  const scopeToBranch = !canSeeAllBranches(session);
  const bmBranchKey = scopeToBranch
    ? normalizeLocation((session.user as { branchName?: string | null }).branchName ?? null)
    : null;
  const matchesBranch = (raw: string | null | undefined) =>
    !scopeToBranch || (bmBranchKey !== 'Unknown' && normalizeLocation(raw ?? null) === bmBranchKey);

  const client = await pool.connect();
  try {
    // --- Onboarding (hardcoded) ---
    const onboarding = onboardingRaw
      .filter((r) => matchesBranch(r.branch))
      .map((r) => ({
        ...r,
        isHighlight: isWithinDays(r.date, 0, 14),
      }));

    // --- Offboarding (hardcoded) ---
    const offboarding = offboardingRaw
      .filter((r) => matchesBranch(r.branch))
      .map((r) => ({
        ...r,
        isHighlight: isWithinDays(r.date, 0, 14),
      }));

    // --- MC (from MedicalLeave table) ---
    const twoWeeksAgoMc = new Date();
    twoWeeksAgoMc.setDate(twoWeeksAgoMc.getDate() - 14);
    const todayMc = new Date();
    todayMc.setHours(23, 59, 59, 999);

    const mcRes = await client.query(
      `SELECT "employeeCode", "name", "position", "dept", "branch", "leaveDate", "reason", "status", "days"
       FROM "MedicalLeave"
       WHERE "leaveDate" >= $1 AND "leaveDate" <= $2
       ORDER BY "leaveDate" DESC`,
      [twoWeeksAgoMc.toISOString(), todayMc.toISOString()]
    );

    const mc = mcRes.rows
      .filter((row: any) => matchesBranch(row.branch))
      .map((row: any) => {
        const ld = new Date(row.leaveDate);
        const dateStr = ld.toISOString().split("T")[0];
        return {
          employeeCode: row.employeeCode,
          name: row.name || row.employeeCode,
          position: row.position || "-",
          dept: row.dept || "-",
          branch: row.branch || "-",
          date: dateStr,
          reason: (row.reason || "").replace(/\r\n|\r|\n/g, " ").trim(),
          status: row.status,
          days: row.days,
          isHighlight: isWithinDays(dateStr, -3, 0),
        };
      });

    // --- Annual Leave (from database) ---
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
    const oneWeekLater = new Date();
    oneWeekLater.setDate(oneWeekLater.getDate() + 7);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const alRes = await client.query(
      `SELECT "EmployeeCode", "LeaveDate", "ApplyDate", "ApplyReason", "ApplyStatus", "Days", "ActionRemark"
       FROM "LeaveTransaction"
       WHERE "LeaveTypeCode" = 'AL'
         AND "LeaveDate" >= $1 AND "LeaveDate" <= $2
       ORDER BY "LeaveDate" DESC`,
      [oneWeekAgo.toISOString(), twoWeeksLater.toISOString()]
    );

    // Build the set of EmployeeCodes belonging to the BM's branch so we can
    // filter Annual Leave (LeaveTransaction has no branch column). Admin/HOD
    // skip this and see all rows.
    let allowedEmpCodes: Set<string> | null = null;
    if (scopeToBranch) {
      const allStaff = await prisma.branchStaff.findMany({
        select: { employeeId: true, branch: true },
      });
      allowedEmpCodes = new Set(
        allStaff
          .filter(s => bmBranchKey !== 'Unknown' && normalizeLocation(s.branch ?? null) === bmBranchKey)
          .map(s => s.employeeId)
          .filter((id): id is string => !!id)
      );
    }

    const annualLeave = alRes.rows
      .filter((row: any) => !allowedEmpCodes || allowedEmpCodes.has(String(row.EmployeeCode)))
      .map((row: any) => {
        const ld = new Date(row.LeaveDate);
        // Extract approver/remark name if present
        const remark = (row.ActionRemark || "").replace(/\r\n|\r|\n/g, " ").trim();
        return {
          employeeCode: row.EmployeeCode,
          name: row.EmployeeCode,
          position: "-",
          dept: "-",
          branch: "-",
          date: ld.toISOString().split("T")[0],
          reason: (row.ApplyReason || "").replace(/\r\n|\r|\n/g, " ").trim(),
          status: row.ApplyStatus,
          days: row.Days,
          remark: remark.substring(0, 80),
          isHighlight: ld >= todayStart && ld <= oneWeekLater,
        };
      });

    // --- Today-only lists for overview cards ---
    const todayStr = new Date().toISOString().split("T")[0];
    const mcToday = mc.filter((r) => r.date === todayStr);
    const annualLeaveToday = annualLeave.filter((r) => r.date === todayStr);

    return NextResponse.json({
      onboarding,
      offboarding,
      mc,
      mcToday,
      annualLeave,
      annualLeaveToday,
      counts: {
        onboarding: onboarding.length,
        onboardingHighlight: onboarding.filter((r) => r.isHighlight).length,
        offboarding: offboarding.length,
        offboardingHighlight: offboarding.filter((r) => r.isHighlight).length,
        mc: mc.length,
        mcToday: mcToday.length,
        mcHighlight: mc.filter((r) => r.isHighlight).length,
        annualLeave: annualLeave.length,
        annualLeaveToday: annualLeaveToday.length,
        annualLeaveHighlight: annualLeave.filter((r) => r.isHighlight).length,
      },
    });
  } catch (err: any) {
    console.error("HR Dashboard API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
