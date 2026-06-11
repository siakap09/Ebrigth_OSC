import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { hrfsPrisma } from "@/lib/hrfs";

export const dynamic = "force-dynamic";

/**
 * GET /api/fa/coaches
 *
 * Full-time coaches/staff for the FA report "Prepared by" dropdown. The
 * BranchStaff.employment_type column is dirty (many free-text / NaN values),
 * so we key off the clean `role` field instead: full-timers are the FT* roles
 * (FT Coach / FT EXEC / FT HOD) plus BM (branch managers, who are full-time
 * and prepare FA reports). Part-timers (PT Coach) and interns (INT) are
 * intentionally excluded. Read-only; any signed-in user.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const staff = await hrfsPrisma.branchStaff.findMany({
      select: { id: true, name: true, nickname: true, branch: true, role: true },
      where: {
        status: { equals: "Active", mode: "insensitive" },
        OR: [
          { role: { startsWith: "FT", mode: "insensitive" } },
          { role: { equals: "BM", mode: "insensitive" } },
        ],
      },
      orderBy: [{ branch: "asc" }, { nickname: "asc" }],
    });

    const coaches = staff
      .map((s) => ({
        id: String(s.id),
        name: (s.nickname?.trim() || s.name?.trim() || "").toString(),
        branch: s.branch?.trim() || null,
        role: s.role?.trim() || null,
      }))
      .filter((c) => c.name.length > 0);

    return NextResponse.json({ coaches });
  } catch (err) {
    console.error("[api/fa/coaches] failed:", err);
    return NextResponse.json({ error: "Failed to load coaches" }, { status: 500 });
  }
}
