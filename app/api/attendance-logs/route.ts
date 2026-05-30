import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { isEmployee } from '@/lib/roles';

// GET /api/attendance-logs
//   ?empNo=44080014&month=4&year=2026           → exact empNo lookup
//   ?staffName=MOHAMD FAIQ SOUDAGAR&month=4&year=2026 → name-based lookup for BranchStaff
//
// Scoping:
//   Admin / HOD            → may look up any empNo / staffName.
//   Branch Manager         → may look up only staff in their branch.
//   Part_Time / Full_Time  → may look up only themselves.
//   Anyone else (Executive/Intern/unknown) → empty (fail closed).

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const empNo     = searchParams.get('empNo');
    const staffName = searchParams.get('staffName'); // full BranchStaff name
    const month     = searchParams.get('month');
    const year      = searchParams.get('year') ?? new Date().getFullYear().toString();

    if (!month) {
      return NextResponse.json({ error: 'month is required' }, { status: 400 });
    }

    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    // Resolve the allowed empNo set for non-admin callers.
    //   null  → unrestricted (admin/HOD)
    //   []    → fail closed
    //   [...] → restricted to these empNos
    let allowedEmpNos: string[] | null = null;
    let allowedNames: Set<string> | null = null;

    if (!canSeeAllBranches(session)) {
      if (isEmployee(sessionUser?.role)) {
        if (!sessionUser.email) return NextResponse.json([]);
        const self = await hrfsPrisma.branchStaff.findFirst({
          where: { email: { equals: sessionUser.email, mode: 'insensitive' } },
          select: { employeeId: true, name: true },
        });
        allowedEmpNos = self?.employeeId ? [self.employeeId] : [];
        allowedNames  = new Set(self?.name ? [self.name.toUpperCase()] : []);
      } else if (sessionUser?.branchName) {
        const staff = await hrfsPrisma.branchStaff.findMany({
          where: { branch: sessionUser.branchName },
          select: { employeeId: true, name: true },
        });
        allowedEmpNos = staff.map(s => s.employeeId).filter((e): e is string => !!e);
        allowedNames  = new Set(
          staff.map(s => s.name).filter((n): n is string => !!n).map(n => n.toUpperCase())
        );
      } else {
        return NextResponse.json([]);
      }
    }

    // ── Exact empNo lookup ─────────────────────────────────────────────────────
    if (empNo) {
      if (allowedEmpNos !== null && !allowedEmpNos.includes(empNo)) {
        return NextResponse.json([]);
      }
      const logs = await prisma.attendanceLog.findMany({
        where: { empNo, date: { startsWith: prefix } },
        orderBy: { date: 'asc' },
        select: { date: true, empName: true, clockInTime: true, clockOutTime: true },
      });
      return NextResponse.json(logs);
    }

    // ── Name-based lookup (BranchStaff full name → scanner short empName) ─────
    // Scanner stores short names (e.g. "FAIQ"); BranchStaff has full names
    // (e.g. "MOHAMD FAIQ SOUDAGAR"). Extract meaningful tokens and match any.
    if (staffName) {
      // For scoped roles, refuse lookup of a name they have no claim to.
      if (allowedNames !== null && !allowedNames.has(staffName.toUpperCase())) {
        return NextResponse.json([]);
      }
      const SKIP = new Set(['BIN', 'BINTI', 'A/L', 'A/P', 'BTE', 'AP', 'NIK', 'NUR', 'NURUL', 'MUHAMMAD', 'MOHD', 'BINTI', 'ABD']);
      const tokens = staffName
        .toUpperCase()
        .split(/\s+/)
        .filter(t => t.length > 2 && !SKIP.has(t));

      if (tokens.length === 0) return NextResponse.json([]);

      const logs = await prisma.attendanceLog.findMany({
        where: {
          date: { startsWith: prefix },
          OR: tokens.map(token => ({
            empName: { contains: token, mode: 'insensitive' as const },
          })),
          // Defense in depth: even if the token regex matched somebody outside
          // the caller's scope, only return rows whose empNo is in the allowed
          // set.
          ...(allowedEmpNos !== null && { empNo: { in: allowedEmpNos } }),
        },
        orderBy: { date: 'asc' },
        select: { date: true, empName: true, empNo: true, clockInTime: true, clockOutTime: true },
      });

      // De-duplicate by date+empNo in case multiple tokens matched
      const seen = new Set<string>();
      const unique = logs.filter(l => {
        const key = `${l.date}-${l.empNo}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return NextResponse.json(unique);
    }

    return NextResponse.json({ error: 'empNo or staffName is required' }, { status: 400 });
  } catch (error) {
    console.error('GET /api/attendance-logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance logs' }, { status: 500 });
  }
}
