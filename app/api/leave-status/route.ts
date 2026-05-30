import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireSession, canSeeAllBranches } from '@/lib/auth';
import { isEmployee } from '@/lib/roles';

// GET /api/leave-status
//   ?date=2026-05-29            → leave active on a single day
//   ?month=5&year=2026          → all leave days in a month
//
// Returns { leaves: [{ empNo, date, type }] } where `empNo` matches
// AttendanceLog.empNo / BranchStaff.employeeId, `date` is YYYY-MM-DD, and
// `type` is the leave code (AL, MC, EL, …). Sick leave (SL) is normalised to MC.
//
// Sources: LeaveTransaction (any LeaveTypeCode) + MedicalLeave (always MC).
// Records explicitly rejected/cancelled are excluded; everything else counts.
//
// Scoping mirrors /api/attendance-logs:
//   Admin / HOD            → all staff.
//   Branch Manager         → only their branch's staff.
//   Part_Time / Full_Time  → only themselves.
//   Anyone else            → empty (fail closed).

function isRejected(status: string | null | undefined): boolean {
  if (!status) return false;
  return /reject|cancel|void|withdraw/i.test(status);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normaliseType(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return 'LEAVE';
  if (c === 'SL') return 'MC'; // sick leave → medical cert label
  return c;
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const date  = searchParams.get('date');
    const month = searchParams.get('month');
    const year  = searchParams.get('year') ?? new Date().getFullYear().toString();

    // ── Resolve the date window [start, end) ───────────────────────────────────
    let start: Date;
    let end: Date;
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      if (!y || !m || !d) {
        return NextResponse.json({ error: 'invalid date' }, { status: 400 });
      }
      start = new Date(Date.UTC(y, m - 1, d));
      end   = new Date(Date.UTC(y, m - 1, d + 1));
    } else if (month) {
      const mNum = parseInt(month, 10);
      const yNum = parseInt(year, 10);
      if (!mNum || mNum < 1 || mNum > 12 || !yNum) {
        return NextResponse.json({ error: 'invalid month/year' }, { status: 400 });
      }
      start = new Date(Date.UTC(yNum, mNum - 1, 1));
      end   = new Date(Date.UTC(yNum, mNum, 1));
    } else {
      return NextResponse.json({ error: 'date or month is required' }, { status: 400 });
    }

    // ── Resolve the allowed empNo set for non-admin callers ────────────────────
    //   null → unrestricted; [] → fail closed; [...] → restricted.
    let allowedEmpNos: string[] | null = null;
    const sessionUser = session.user as { role?: unknown; email?: string | null; branchName?: string };

    if (!canSeeAllBranches(session)) {
      if (isEmployee(sessionUser?.role)) {
        if (!sessionUser.email) return NextResponse.json({ leaves: [] });
        const self = await hrfsPrisma.branchStaff.findFirst({
          where: { email: { equals: sessionUser.email, mode: 'insensitive' } },
          select: { employeeId: true },
        });
        allowedEmpNos = self?.employeeId ? [self.employeeId] : [];
      } else if (sessionUser?.branchName) {
        const staff = await hrfsPrisma.branchStaff.findMany({
          where: { branch: sessionUser.branchName },
          select: { employeeId: true },
        });
        allowedEmpNos = staff.map(s => s.employeeId).filter((e): e is string => !!e);
      } else {
        return NextResponse.json({ leaves: [] });
      }
      if (allowedEmpNos.length === 0) return NextResponse.json({ leaves: [] });
    }

    const [transactions, medical] = await Promise.all([
      prisma.leaveTransaction.findMany({
        where: {
          LeaveDate: { gte: start, lt: end },
          ...(allowedEmpNos !== null && { EmployeeCode: { in: allowedEmpNos } }),
        },
        select: { EmployeeCode: true, LeaveTypeCode: true, LeaveDate: true, ApplyStatus: true },
      }),
      prisma.medicalLeave.findMany({
        where: {
          leaveDate: { gte: start, lt: end },
          ...(allowedEmpNos !== null && { employeeCode: { in: allowedEmpNos } }),
        },
        select: { employeeCode: true, leaveDate: true, status: true },
      }),
    ]);

    // Merge into one entry per (empNo, date). MedicalLeave (MC) wins over a
    // matching SL transaction so the same sick day isn't shown twice.
    const byKey = new Map<string, { empNo: string; date: string; type: string }>();

    for (const t of transactions) {
      if (!t.EmployeeCode || !t.LeaveDate || isRejected(t.ApplyStatus)) continue;
      const dateStr = toDateStr(t.LeaveDate);
      byKey.set(`${t.EmployeeCode}|${dateStr}`, {
        empNo: t.EmployeeCode,
        date: dateStr,
        type: normaliseType(t.LeaveTypeCode),
      });
    }
    for (const m of medical) {
      if (!m.employeeCode || !m.leaveDate || isRejected(m.status)) continue;
      const dateStr = toDateStr(m.leaveDate);
      byKey.set(`${m.employeeCode}|${dateStr}`, {
        empNo: m.employeeCode,
        date: dateStr,
        type: 'MC',
      });
    }

    return NextResponse.json({ leaves: Array.from(byKey.values()) });
  } catch (err) {
    console.error('GET /api/leave-status error:', err);
    return NextResponse.json({ error: 'Failed to fetch leave status' }, { status: 500 });
  }
}
