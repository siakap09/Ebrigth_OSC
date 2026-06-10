/**
 * lib/hikvision-email-sync.ts
 *
 * Clock-in / clock-out email notifications driven by the LIVE attendance
 * pipeline (public.hikvision_attendance_all), which is populated by the
 * external Hikvision integration. The old emails came from scanner-sync.ts
 * (AttendanceLog) — that path is now silenced; this is its replacement.
 *
 * Per person per day:
 *   • first scan        → Clock-In email
 *   • a 2nd (later) scan → Clock-Out email
 * Each email is sent at most once, tracked in hikvision_attendance_email_log
 * (claim-before-send so concurrent ticks never double-send; the claim is
 * released if the send fails so it retries next tick).
 *
 * Gated by the HIKVISION_EMAIL_SYNC env flag (see instrumentation.ts) so it
 * only runs where it's explicitly switched on.
 */

import { prisma } from '@/lib/prisma';
import { hrfsPrisma } from '@/lib/hrfs';
import { sendClockInEmail, sendClockOutEmail } from '@/lib/mailer';

function todayKL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

interface DayScan {
  person_id: string;
  name: string | null;
  first_time: string; // HH:MM:SS (KL)
  last_time: string;  // HH:MM:SS (KL)
  scans: number;
}

let tableReady = false;
async function ensureLogTable(): Promise<void> {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.hikvision_attendance_email_log (
      person_id text        NOT NULL,
      date      text        NOT NULL,
      kind      text        NOT NULL,        -- 'in' | 'out'
      sent_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (person_id, date, kind)
    )`);
  tableReady = true;
}

/** Atomically reserve an email slot. Returns true only if WE inserted it. */
async function claim(personId: string, date: string, kind: 'in' | 'out'): Promise<boolean> {
  const affected = await prisma.$executeRawUnsafe(
    `INSERT INTO public.hikvision_attendance_email_log (person_id, date, kind)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    personId, date, kind,
  );
  return affected === 1;
}
async function unclaim(personId: string, date: string, kind: 'in' | 'out'): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM public.hikvision_attendance_email_log
      WHERE person_id = $1 AND date = $2 AND kind = $3`,
    personId, date, kind,
  );
}

/** One pass: send any not-yet-sent clock-in / clock-out emails for today. */
export async function syncHikvisionEmails(): Promise<void> {
  await ensureLogTable();
  const date = todayKL();

  const scans = await prisma.$queryRawUnsafe<DayScan[]>(
    `SELECT person_id,
            max(name) AS name,
            to_char(min(event_time), 'HH24:MI:SS') AS first_time,
            to_char(max(event_time), 'HH24:MI:SS') AS last_time,
            count(*)::int AS scans
       FROM public.hikvision_attendance_all
      WHERE event_time::date = $1::date
        AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'
      GROUP BY person_id`,
    date,
  );
  if (scans.length === 0) return;

  // Resolve recipient + display name from BranchStaff (person_id has already
  // been corrected by the remap trigger, so it matches employeeId).
  const ids = scans.map(s => s.person_id);
  const staff = await hrfsPrisma.branchStaff.findMany({
    where: { employeeId: { in: ids } },
    select: { employeeId: true, name: true, email: true },
  });
  const byId = new Map(staff.map(s => [String(s.employeeId), s]));

  for (const s of scans) {
    const st = byId.get(s.person_id);
    const email = st?.email;
    if (!email) continue; // no address on file → can't notify; skip quietly
    const name = st?.name || s.name || s.person_id;

    // Clock-in — on first sighting today.
    if (await claim(s.person_id, date, 'in')) {
      try {
        await sendClockInEmail(email, name, s.first_time);
      } catch (e) {
        await unclaim(s.person_id, date, 'in');
        console.error(`[hikvision-email] clock-in failed (${name}):`, (e as Error).message);
      }
    }

    // Clock-out — once they have a second (later) scan.
    if (s.scans >= 2 && (await claim(s.person_id, date, 'out'))) {
      try {
        await sendClockOutEmail(email, name, s.last_time);
      } catch (e) {
        await unclaim(s.person_id, date, 'out');
        console.error(`[hikvision-email] clock-out failed (${name}):`, (e as Error).message);
      }
    }
  }
}
