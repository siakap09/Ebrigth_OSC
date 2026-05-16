import { NextResponse } from "next/server";
import { fetchAllEventData } from "@fa/_lib/events.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchAllEventData();
    return NextResponse.json(data);
  } catch (err) {
    // TEMP DEBUG (remove once the staging 500 is diagnosed): leak the actual
    // error string and DB host info to the browser so we can see why staging
    // can't reach the FA database.
    console.error("[api/fa/data] failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 4).join(" | ") : "";
    return NextResponse.json(
      {
        error: "Failed to load FA data",
        debug: {
          message,
          stack,
          db_url_present: !!process.env.FA_DATABASE_URL || !!process.env.DATABASE_URL,
          // Show the host:port portion only — credentials stripped.
          db_host: (process.env.FA_DATABASE_URL || process.env.DATABASE_URL || "")
            .replace(/^[^@]+@/, "")
            .split("?")[0],
        },
      },
      { status: 500 }
    );
  }
}
