import { NextResponse } from "next/server";
import { fetchAllEventData } from "@fa/_lib/events.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchAllEventData();
    return NextResponse.json(data);
  } catch (err) {
    // Surface the underlying error message + Postgres error code in the
    // response body so we can diagnose schema mismatches between staging
    // and prod (the previous generic "Failed to load FA data" hid every
    // useful detail). Safe to log: this endpoint is auth-gated and the
    // payload is just "column X does not exist" etc., nothing sensitive.
    console.error("[api/fa/data] failed:", err);
    const e = err as { message?: string; code?: string };
    return NextResponse.json(
      { error: "Failed to load FA data", detail: e?.message ?? String(err), code: e?.code },
      { status: 500 },
    );
  }
}
