import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { isEmployee } from '@/lib/roles';

// GET /api/attendance-today?date=YYYY-MM-DD
// Returns attendance for the given date from BOTH scanner tables:
//   - AttendanceLog    (HQ + multi-scanner, carries scannerLocation natively)
//   - AttendanceLogST  (Subang Taipan scanner — tagged 'Subang Taipan' on read)
// If `date` is missing or invalid, defaults to today (Kuala Lumpur timezone).
// The dashboard filters client-side by scannerLocation, so ST rows surface under the ST tab.
//
// Scoping (defence-in-depth, layered on top of the middleware page guard):
//   Admin / HOD / HR       → every branch.
//   Branch Manager         → only staff registered to their branch.
//   Part_Time / Full_Time  → only their own attendance row.
//   Anyone else            → empty (fail closed).

export const dynamic = 'force-dynamic';

interface AttendanceTodayRow {
  date: string;
  empNo: string;
  empName: string;
  clockInTime: string;
  clockOutTime: string | null;
  clockInSerialNo: string;
  clockOutSerialNo: string | null;
  scannerLocation: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayKL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const requested = req.nextUrl.searchParams.get('date');
    const date = requested && DATE_RE.test(requested) ? requested : todayKL();
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    // empNoFilter:
    //   null → no filter (admin / HOD / HR — full visibility)
    //   []   → fail closed (no rows returned)
    //   [...]→ only these empNos
    let empNoFilter: string[] | null = null;

    if (!canSeeAllBranches(session)) {
      if (isEmployee(sessionUser?.role)) {
        if (!sessionUser.email) return NextResponse.json([]);
        const self = await hrfsPrisma.branchStaff.findFirst({
          where:  { email: { equals: sessionUser.email, mode: 'insensitive' } },
          select: { employeeId: true },
        });
        empNoFilter = self?.employeeId ? [self.employeeId] : [];
      } else if (sessionUser?.branchName) {
        const staff = await hrfsPrisma.branchStaff.findMany({
          where:  { branch: sessionUser.branchName },
          select: { employeeId: true },
        });
        empNoFilter = staff.map(s => s.employeeId).filter((e): e is string => !!e);
      } else {
        empNoFilter = [];
      }
    }

    // If the filter resolved to an empty list, short-circuit — no point
    // querying the DB with `empNo IN ()` which Postgres rejects anyway.
    if (empNoFilter !== null && empNoFilter.length === 0) {
      return NextResponse.json([]);
    }

    const mainLogs = await prisma.attendanceLog.findMany({
      where: {
        date,
        ...(empNoFilter !== null && { empNo: { in: empNoFilter } }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        date: true,
        empNo: true,
        empName: true,
        clockInTime: true,
        clockOutTime: true,
        clockInSerialNo: true,
        clockOutSerialNo: true,
        scannerLocation: true,
      },
    });

    // AttendanceLogST is not yet in the generated Prisma client; query via
    // raw SQL. Apply the same empNo filter as a parameterised IN clause.
    let stWhere = `WHERE "date" = $1`;
    const stParams: unknown[] = [date];
    if (empNoFilter !== null) {
      const placeholders = empNoFilter.map((_, i) => `$${i + 2}`).join(', ');
      stWhere += ` AND "empNo" IN (${placeholders})`;
      stParams.push(...empNoFilter);
    }

    const stRowsRaw = await prisma.$queryRawUnsafe<Array<{
      date: string;
      empNo: string;
      empName: string;
      clockInTime: string;
      clockOutTime: string | null;
      clockInSerialNo: string;
      clockOutSerialNo: string | null;
      createdAt: Date;
    }>>(
      `SELECT "date", "empNo", "empName", "clockInTime", "clockOutTime",
              "clockInSerialNo", "clockOutSerialNo", "createdAt"
       FROM "AttendanceLogST"
       ${stWhere}
       ORDER BY "createdAt" DESC`,
      ...stParams,
    );

    const stLogs: AttendanceTodayRow[] = stRowsRaw.map(r => ({
      date:             r.date,
      empNo:            r.empNo,
      empName:          r.empName,
      clockInTime:      r.clockInTime,
      clockOutTime:     r.clockOutTime,
      clockInSerialNo:  r.clockInSerialNo,
      clockOutSerialNo: r.clockOutSerialNo,
      scannerLocation:  'Subang Taipan',
    }));

    return NextResponse.json([...mainLogs, ...stLogs]);
  } catch (err) {
    console.error('/api/attendance-today error:', err);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
