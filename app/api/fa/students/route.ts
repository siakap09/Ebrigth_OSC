import { NextResponse } from "next/server";
import { fetchAllStudents } from "@fa/_lib/students.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { students, report } = await fetchAllStudents();
    return NextResponse.json({ students, report });
  } catch (err) {
    // TEMP DEBUG (remove once the staging 500 is diagnosed): include the
    // actual server error in the response so we can see what's blocking
    // staging from reading studentrecords.
    console.error("[/api/students] failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 4).join(" | ") : "";
    return NextResponse.json(
      {
        error: "Failed to load students",
        debug: {
          message,
          stack,
          db_url_present: !!process.env.FA_DATABASE_URL || !!process.env.DATABASE_URL,
          db_host: (process.env.FA_DATABASE_URL || process.env.DATABASE_URL || "")
            .replace(/^[^@]+@/, "")
            .split("?")[0],
        },
      },
      { status: 500 }
    );
  }
}
