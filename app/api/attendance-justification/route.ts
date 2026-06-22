import { NextRequest, NextResponse } from "next/server";
import { hrfsPrisma } from "@/lib/hrfs";
import { requireSession, canSeeAllBranches } from "@/lib/auth";
import { uploadToGoogleDrive, isGoogleDriveConfigured } from "@/lib/googleDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attendance justification — why a "missing" employee was absent on a given day.
//
// Storage: public.attendance_justification in ebright_hrfs (one row per
// emp_no + just_date, upserted). A justified person moves out of the Missing
// box into the Justify box on the Attendance dashboard. Evidence files (optional)
// are uploaded to Google Drive and only the shareable link is stored.
//
//   GET    ?date=YYYY-MM-DD        → all justifications for that date
//   POST   { empNo, date, ... }    → create/update a justification (HR/admin)
//   DELETE ?empNo=&date=           → remove a justification (back to Missing)
//
// Reads are open to any signed-in user (the dashboard is already role-gated by
// page middleware); writes require a cross-branch role (HR / admin / HOD).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface JustRow {
  emp_no: string;
  branch: string | null;
  emp_name: string | null;
  just_date: string;
  reason: string | null;
  evidence_url: string | null;
  evidence_name: string | null;
  justified_by: string | null;
}

function toClient(r: JustRow) {
  return {
    empNo: r.emp_no,
    branch: r.branch,
    empName: r.emp_name,
    date: r.just_date,
    reason: r.reason,
    evidenceUrl: r.evidence_url,
    evidenceName: r.evidence_name,
    justifiedBy: r.justified_by,
  };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  try {
    const rows = await hrfsPrisma.$queryRawUnsafe<JustRow[]>(
      `SELECT emp_no, branch, emp_name, to_char(just_date,'YYYY-MM-DD') AS just_date,
              reason, evidence_url, evidence_name, justified_by
         FROM public.attendance_justification
        WHERE just_date = $1::date
        ORDER BY emp_name ASC`,
      date,
    );
    return NextResponse.json({ justifications: rows.map(toClient) });
  } catch (err) {
    console.error("GET /api/attendance-justification error:", err);
    return NextResponse.json({ error: "Failed to load justifications" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  if (!canSeeAllBranches(session)) {
    return NextResponse.json({ error: "Only HR / admin can justify attendance" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const empNo = String(body.empNo ?? "").trim();
    const date = String(body.date ?? "").trim();
    const reason = body.reason ? String(body.reason).trim() : null;
    const branch = body.branch ? String(body.branch).trim() : null;
    const empName = body.empName ? String(body.empName).trim() : null;

    if (!empNo || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "empNo and date (YYYY-MM-DD) are required" }, { status: 400 });
    }

    // Evidence is optional; so is the reason — but at least one must be present.
    let evidenceUrl: string | null = null;
    let evidenceName: string | null = null;
    if (body.evidenceBase64) {
      if (!isGoogleDriveConfigured()) {
        return NextResponse.json(
          { error: "Evidence upload needs Google Drive (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_FOLDER_ID). Submit a reason instead, or set up Drive." },
          { status: 503 },
        );
      }
      const mime = String(body.evidenceMime ?? "application/octet-stream");
      const ext = (String(body.evidenceName ?? "").match(/\.[A-Za-z0-9]+$/)?.[0]) ?? "";
      const safe = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "x";
      const fileName = `justify-${safe(empNo)}-${date}-${Date.now()}${ext}`;
      const { webViewLink } = await uploadToGoogleDrive(String(body.evidenceBase64), fileName, mime);
      evidenceUrl = webViewLink;
      evidenceName = body.evidenceName ? String(body.evidenceName).slice(0, 200) : fileName;
    }

    if (!reason && !evidenceUrl) {
      return NextResponse.json({ error: "Provide a reason or upload evidence" }, { status: 400 });
    }

    const justifiedBy =
      (session.user as { email?: string | null; name?: string | null })?.email ||
      (session.user as { name?: string | null })?.name ||
      "unknown";

    // Upsert. On update, keep an existing reason/evidence when this request
    // doesn't supply a new one (so adding evidence later doesn't wipe the reason).
    await hrfsPrisma.$executeRawUnsafe(
      `INSERT INTO public.attendance_justification
         (emp_no, branch, emp_name, just_date, reason, evidence_url, evidence_name, justified_by, updated_at)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8, now())
       ON CONFLICT (emp_no, just_date) DO UPDATE SET
         branch        = COALESCE(EXCLUDED.branch, attendance_justification.branch),
         emp_name      = COALESCE(EXCLUDED.emp_name, attendance_justification.emp_name),
         reason        = COALESCE(EXCLUDED.reason, attendance_justification.reason),
         evidence_url  = COALESCE(EXCLUDED.evidence_url, attendance_justification.evidence_url),
         evidence_name = COALESCE(EXCLUDED.evidence_name, attendance_justification.evidence_name),
         justified_by  = EXCLUDED.justified_by,
         updated_at    = now()`,
      empNo, branch, empName, date, reason, evidenceUrl, evidenceName, justifiedBy,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/attendance-justification error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save justification" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  if (!canSeeAllBranches(session)) {
    return NextResponse.json({ error: "Only HR / admin can change attendance justification" }, { status: 403 });
  }

  const empNo = (req.nextUrl.searchParams.get("empNo") ?? "").trim();
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!empNo || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "empNo and date (YYYY-MM-DD) are required" }, { status: 400 });
  }
  try {
    await hrfsPrisma.$executeRawUnsafe(
      `DELETE FROM public.attendance_justification WHERE emp_no = $1 AND just_date = $2::date`,
      empNo, date,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/attendance-justification error:", err);
    return NextResponse.json({ error: "Failed to remove justification" }, { status: 500 });
  }
}
