import "server-only";
import { prisma } from "@/lib/prisma";
import { pool as faPool } from "@/app/fa-system/_lib/db";

interface StudentRecordRow {
  id: number;
  name: string;
  branch: string | null;
  expiry: string | null;
}

/**
 * Ensure a BurnlistWeek snapshot exists for the given weekKey. Idempotent:
 * if the row already exists, returns it without re-querying studentrecords.
 *
 * Q3 from spec = (b): newly-expired students mid-week wait until the NEXT
 * Wednesday's snapshot — so once a week is created it is NOT re-synced.
 */
export async function ensureWeekSnapshot(weekKey: string) {
  const existing = await prisma.burnlistWeek.findUnique({
    where: { weekKey },
    include: { entries: true },
  });
  if (existing) return { week: existing, created: false };

  const { rows } = await faPool.query<StudentRecordRow>(
    `SELECT id,
            name,
            branch,
            TO_CHAR(credit_expiry_date, 'YYYY-MM-DD') AS expiry
       FROM studentrecords
      WHERE package_status = 'Expired'
        AND status = 'Active'
        AND name IS NOT NULL
        AND TRIM(name) <> ''
        AND credit_expiry_date IS NOT NULL
      ORDER BY credit_expiry_date DESC, name`,
  );

  const week = await prisma.burnlistWeek.create({
    data: {
      weekKey,
      entries: {
        create: rows.map((r) => ({
          studentRecordId: String(r.id),
          studentName: r.name,
          branch: r.branch ?? "",
          expiryDate: r.expiry ?? "",
        })),
      },
    },
    include: { entries: true },
  });

  return { week, created: true };
}
