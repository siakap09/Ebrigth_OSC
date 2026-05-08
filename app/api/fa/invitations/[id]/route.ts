import { NextRequest, NextResponse } from "next/server";
import { deleteInvitationRow, updateInvitationRow } from "@fa/_lib/events.server";
import { InvitationStatus } from "@fa/_types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await updateInvitationRow(id, {
      status: body.status as InvitationStatus | undefined,
      sessionId: body.sessionId,
      markedBy: body.markedBy,
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/fa/invitations PATCH] failed:", err);
    return NextResponse.json({ error: "Failed to update invitation" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    await deleteInvitationRow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/fa/invitations DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
  }
}
