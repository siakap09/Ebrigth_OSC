// ─────────────────────────────────────────────────────────────────────────────
// Scanner-ST person-ID collision remap  (display / attribution only)
//
// WHY THIS EXISTS — DO NOT "SIMPLIFY" THIS AWAY:
// Four staff based at Subang Taipan ("scanner ST", Hikvision device FV9958286)
// were enrolled on that device under person_ids that ALREADY belonged to four
// different HQ staff. This is an ID collision in the access-control system /
// Hik-Connect — we are explicitly NOT allowed to touch the devices. The result:
// when a Subang Taipan person scans at ST, the event arrives tagged with the HQ
// colleague's person_id + name, so the dashboard shows the wrong person.
//
// We re-attribute scans ONLY on device ST to the real person, at the data layer.
// The SAME person_ids on any OTHER device ("scanner main" GN3851746, etc.) are
// the genuine HQ staff and MUST NOT be remapped — that is why every lookup here
// is gated on the ST device id.
//
// Verified 2026-06-20 against public.hikvision_attendance_all + "BranchStaff":
//   ST person_id (wrong name shown)      → real Subang Taipan employee
//     44080099 (KER KAI LOON)            → 77020106  POOJHA A/P R.GANESH
//     44080101 (LOUY RUI EN)             → 77020090  ALYSSA CHLOE LIM
//     44080100 (TEH YEE QIAN)            → 77020088  NEGEETA KAUR A/P RAVINDER SINGH
//     44040097 (BRYANT / HAYTHAM)        → 77020087  HAYTHAM TAREK QUMHIYEH
// ─────────────────────────────────────────────────────────────────────────────

export const ST_DEVICE_ID = 'FV9958286';

interface StIdentity { empNo: string; name: string; }

// Keyed by the (wrong) person_id the ST device emits.
const ST_PERSON_REMAP: Readonly<Record<string, StIdentity>> = {
  '44080099': { empNo: '77020106', name: 'POOJHA A/P R.GANESH' },
  '44080101': { empNo: '77020090', name: 'ALYSSA CHLOE LIM' },
  '44080100': { empNo: '77020088', name: 'NEGEETA KAUR A/P RAVINDER SINGH' },
  '44040097': { empNo: '77020087', name: 'HAYTHAM TAREK QUMHIYEH' },
};

// Reverse: real empNo → the ST source person_id that carries their scans.
const ST_REVERSE: Readonly<Record<string, string>> =
  Object.fromEntries(Object.entries(ST_PERSON_REMAP).map(([src, v]) => [v.empNo, src]));

// Re-attribute one scan. On device ST a collided person_id becomes the real
// person's empNo + name; on every other device the scan is returned unchanged.
export function remapStScan(
  deviceId: string | null, personId: string, name: string | null,
): { personId: string; name: string | null } {
  if (deviceId === ST_DEVICE_ID) {
    const m = ST_PERSON_REMAP[personId];
    if (m) return { personId: m.empNo, name: m.name };
  }
  return { personId, name };
}

// Given a real empNo, the extra ST source person_id (if any) whose scans belong
// to them — used by the monthly report and by branch-scoped queries.
export function stSourceFor(empNo: string): string | undefined {
  return ST_REVERSE[empNo];
}
