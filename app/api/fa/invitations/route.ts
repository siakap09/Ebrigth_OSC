import { NextRequest, NextResponse } from "next/server";
import {
  countInvitationsForSessionBranch,
  createInvitationRow,
  getEventStatus,
  getQuotaForSessionBranch,
} from "@fa/_lib/events.server";
import { BranchCode, InvitationStatus } from "@fa/_types";

export const dynamic = "force-dynamic";

// POST /api/fa/invitations — create one invitation.
// Returns { invitation: null, reason } when the create is rejected by a
// business rule (already invited / quota full / event closed). The 409 code
// signals "valid request but conflicts with current state" so the client can
// distinguish from a real server error.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, sessionId, studentId, branch, invitedBy } = body;
    const status: InvitationStatus = body.initialStatus ?? "invited";
    const allowOverQuota: boolean = body.allowOverQuota === true;

    // Event must exist and be in an invitable state (unless walk-in override).
    const eventStatus = await getEventStatus(eventId);
    if (!eventStatus) {
      return NextResponse.json(
        { invitation: null, reason: "Event not found" },
        { status: 404 }
      );
    }
    if (
      !allowOverQuota &&
      (eventStatus === "closed" || eventStatus === "completed")
    ) {
      return NextResponse.json(
        { invitation: null, reason: "Event is closed" },
        { status: 409 }
      );
    }

    if (!allowOverQuota) {
      const quota = await getQuotaForSessionBranch(sessionId, branch as BranchCode);
      if (quota == null) {
        return NextResponse.json(
          { invitation: null, reason: "No quota for this branch" },
          { status: 409 }
        );
      }
      const used = await countInvitationsForSessionBranch(sessionId, branch as BranchCode);
      if (used >= quota) {
        return NextResponse.json(
          { invitation: null, reason: "Quota full" },
          { status: 409 }
        );
      }
    }

    const created = await createInvitationRow({
      eventId,
      sessionId,
      studentId,
      branch: branch as BranchCode,
      status,
      invitedBy,
    });
    if (!created) {
      // Unique-violation: student already invited to this event.
      return NextResponse.json(
        { invitation: null, reason: "Already invited" },
        { status: 409 }
      );
    }
    return NextResponse.json({ invitation: created });
  } catch (err) {
    console.error("[api/fa/invitations POST] failed:", err);
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}
