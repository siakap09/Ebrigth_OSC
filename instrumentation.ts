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

  // Run today's sync once immediately on boot so we don't wait for the first interval
  syncScannerToDb().catch(err => {
    console.error('[scanner-sync] Initial sync error:', err);
  });

  setInterval(() => {
    syncScannerToDb().catch(err => {
      console.error('[scanner-sync] Sync error:', err);
    });
  }, SYNC_INTERVAL_MS);
}
