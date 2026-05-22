import { NextResponse } from "next/server";
import { fetchAllEventData } from "@fa/_lib/events.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchAllEventData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/fa/data] failed:", err);
    return NextResponse.json({ error: "Failed to load FA data" }, { status: 500 });
  }
}
