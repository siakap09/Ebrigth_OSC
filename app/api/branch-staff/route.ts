import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, assertSameBranch, canSeeAllBranches } from "@/lib/auth";
import { MANAGEMENT_ROLES, hasAnyRole } from "@/lib/roles";

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const BRANCH_CODE_MAP: Record<string, string> = {
    'AMP': 'Ampang',
    'BBB': 'Bandar Baru Bangi',
    'BSP': 'Bandar Seri Putra',
    'BTHO': 'Bandar Tun Hussein Onn',
    'CJY': 'Cyberjaya',
    'DA': 'Denai Alam',
    'DK': 'Danau Kota',
    'EGR': 'Eco Grandeur',
    'KD': 'Kota Damansara',
    'KLG': 'Klang',
    'KTG': 'Kajang TTDI Groove',
    'KW': 'Kota Warisan',
    'ONL': 'Online',
    'Online': 'Online',
    'PJY': 'Putrajaya',
    'RBY': 'Rimbayu',
    'SA': 'Setia Alam',
    'SHA': 'Shah Alam',
    'SP': 'Sri Petaling',
    'ST': 'Subang Taipan',
    'Subang Taipan': 'Subang Taipan',
    'TSG': 'Taman Sri Gombak',
  };

  try {
    type StaffRow = {
      id: number;
      nickname: string | null;
      branch: string | null;
      role: string | null;
      status: string | null;
      trainingStartDate: string | null;
      trainingEndDate: string | null;
      endDate: string | null;
    };
    const staff = await prisma.branchStaff.findMany({
      select: {
        id: true,
        nickname: true,
        branch: true,
        role: true,
        status: true,
        trainingStartDate: true,
        trainingEndDate: true,
        endDate: true,
      },
      where: { status: { equals: 'Active', mode: 'insensitive' } },
    }) as StaffRow[];
    // Return nickname as name; map branch code → full name; map role "BM" → branch_manager_xxx
    const mapped = staff
      .filter(s => s.nickname)
      .map(s => {
        const fullBranch = BRANCH_CODE_MAP[s.branch ?? ''] ?? s.branch;
        return {
          id: s.id,
          name: s.nickname as string,
          branch: fullBranch,
          role: s.role?.toUpperCase() === 'BM'
            ? `branch_manager_${(fullBranch ?? '').substring(0, 3).toLowerCase()}`
            : null,
          trainingStartDate: s.trainingStartDate,
          trainingEndDate: s.trainingEndDate,
          endDate: s.endDate,
        };
      });

    // Interim branch scoping: non-management users see only their own branch.
    // The DB stores branch as short codes; we filter on the mapped full names so
    // a session with branchName "Ampang" matches mapped.branch "Ampang".
    //
    // Cross-branch escape hatch for the manpower planning UI: callers with a
    // management role can pass `?include=all` to bypass scoping when they need
    // staff from other branches (e.g. Branch Manager taking a replacement from
    // another branch). Non-management roles cannot escalate via this param.
    const includeAll =
      new URL(request.url).searchParams.get('include') === 'all' &&
      hasAnyRole((session.user as { role?: unknown } | undefined)?.role, MANAGEMENT_ROLES);
    const userBranch = (session.user as { branchName?: string }).branchName;
    const scoped = canSeeAllBranches(session) || includeAll
      ? mapped
      : mapped.filter(m => m.branch === userBranch);

    return NextResponse.json(scoped);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(MANAGEMENT_ROLES);
  if (error) return error;

  // Reverse map: full branch name → short code stored in BranchStaff
  const BRANCH_NAME_TO_CODE: Record<string, string> = {
    'Ampang': 'AMP',
    'Bandar Baru Bangi': 'BBB',
    'Bandar Seri Putra': 'BSP',
    'Bandar Tun Hussein Onn': 'BTHO',
    'Cyberjaya': 'CJY',
    'Denai Alam': 'DA',
    'Danau Kota': 'DK',
    'Eco Grandeur': 'EGR',
    'Kota Damansara': 'KD',
    'Klang': 'KLG',
    'Kajang TTDI Groove': 'KTG',
    'Kota Warisan': 'KW',
    'Online': 'ONL',
    'Putrajaya': 'PJY',
    'Rimbayu': 'RBY',
    'Setia Alam': 'SA',
    'Shah Alam': 'SHA',
    'Sri Petaling': 'SP',
    'Subang Taipan': 'ST',
    'Taman Sri Gombak': 'TSG',
  };

  try {
    const { name, branch, position } = await request.json();
    if (!name?.trim() || !branch) {
      return NextResponse.json({ error: "Name and branch are required" }, { status: 400 });
    }

    const branchGuard = assertSameBranch(session, branch);
    if (branchGuard) return branchGuard;

    const role = position === "Branch Manager" ? "BM" : position?.trim() || null;
    // Store branch as short code if a mapping exists, otherwise store as-is
    const branchCode = BRANCH_NAME_TO_CODE[branch] ?? branch;
    const employee = await prisma.branchStaff.create({
      data: { nickname: name.trim(), branch: branchCode, role },
    });
    return NextResponse.json({ success: true, employee });
  } catch (err: any) {
    console.error('POST /api/branch-staff error:', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Failed to create employee" }, { status: 500 });
  }
}
