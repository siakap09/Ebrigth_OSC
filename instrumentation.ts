/**
 * instrumentation.ts — Next.js server startup hook.
 *
 * Next.js calls register() exactly once when the server process boots.
 * We guard with NEXT_RUNTIME so the interval only runs in the Node.js
 * process (not Edge workers or the browser bundle).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const SYNC_INTERVAL_MS = 10_000; // 10 seconds — tune as needed

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { syncScannerToDb, syncDateToDb, yesterdayKL } = await import('@/lib/scanner-sync');

  console.log(
    `[scanner-sync] Background sync starting — polling every ${SYNC_INTERVAL_MS / 1000}s`
  );

  // On boot: backfill yesterday without sending emails (data already happened).
  // This ensures yesterday's records are always present even if the server was
  // down or restarted overnight.
  const yesterday = yesterdayKL();
  console.log(`[scanner-sync] Backfilling yesterday (${yesterday}) from device…`);
  syncDateToDb(yesterday, false).catch(err => {
    console.error('[scanner-sync] Yesterday backfill error:', err);
  });

  // Run today's sync once immediately on boot so we don't wait for the first interval.
  // sendEmails=false: clock-in/out emails are now driven by the Hikvision pipeline
  // (below), not the AttendanceLog poller — this silences the old AttendanceLog emails.
  syncScannerToDb(false).catch(err => {
    console.error('[scanner-sync] Initial sync error:', err);
  });

  setInterval(() => {
    syncScannerToDb(false).catch(err => {
      console.error('[scanner-sync] Sync error:', err);
    });
  }, SYNC_INTERVAL_MS);

  // ── Hikvision clock-in/out email notifications ────────────────────────────
  // Emails are driven off public.hikvision_attendance_all (the live pipeline).
  // Gated by HIKVISION_EMAIL_SYNC so it only runs where explicitly enabled —
  // set HIKVISION_EMAIL_SYNC=on in the environment to switch it on.
  if (process.env.HIKVISION_EMAIL_SYNC === 'on') {
    const { syncHikvisionEmails } = await import('@/lib/hikvision-email-sync');
    const EMAIL_INTERVAL_MS = 30_000; // 30s — emails don't need a 10s cadence
    console.log(`[hikvision-email] Notifications ON — checking every ${EMAIL_INTERVAL_MS / 1000}s`);
    syncHikvisionEmails().catch(err => console.error('[hikvision-email] Initial run error:', err));
    setInterval(() => {
      syncHikvisionEmails().catch(err => console.error('[hikvision-email] Run error:', err));
    }, EMAIL_INTERVAL_MS);
  } else {
    console.log('[hikvision-email] Disabled (set HIKVISION_EMAIL_SYNC=on to enable).');
  }
}
