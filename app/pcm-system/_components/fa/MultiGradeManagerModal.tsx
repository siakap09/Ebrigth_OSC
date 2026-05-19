"use client";

import { useState, useMemo } from "react";
import { KeyRound, ShieldCheck, Search, CalendarDays } from "lucide-react";
import { Modal } from "@pcm/_components/shared/Modal";
import { useFAStore } from "@pcm/_lib/store";
import { BRANCHES, BranchCode, EventBranchOverride, FAEvent } from "@pcm/_types";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Central manager for multi-grade exceptions. Opens from the Marketing
 * events-list filter row so HQ can manage every event from one place
 * instead of clicking into each event one by one.
 *
 * Flow:
 *   1. Pick the event (defaults to the next-upcoming event).
 *   2. Click branch chips to toggle the override on/off. No reason
 *      prompt — toggling is a one-click action.
 *
 * Day-scope (per-day instead of per-event) is intentionally NOT
 * implemented yet; the current data model is one row per (event, branch).
 * If business need shifts to "Day 1 only, not Day 2", we'll add a
 * day_number column and a third selector. For now, unlocking a branch
 * unlocks every day of the event — the same-day rule inside
 * createInvitationRow still keeps each student to one day each.
 */
export function MultiGradeManagerModal({ open, onClose }: Props) {
  const allEvents = useFAStore((s) => s.events);
  const overrides = useFAStore((s) => s.eventBranchOverrides);
  const grantOverride = useFAStore((s) => s.grantEventBranchOverride);
  const revokeOverride = useFAStore((s) => s.revokeEventBranchOverride);

  // Default to the next-upcoming non-completed event so most clicks are
  // one-step. Marketing can still switch via the dropdown.
  const sortedEvents = useMemo(() => {
    return [...allEvents].sort((a, b) => {
      // Active events first (open/ongoing/draft), completed last.
      const score = (e: FAEvent) => (e.status === "completed" ? 1 : 0);
      const s = score(a) - score(b);
      if (s !== 0) return s;
      return a.startDate.localeCompare(b.startDate);
    });
  }, [allEvents]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    () => sortedEvents.find((e) => e.status !== "completed")?.id ?? sortedEvents[0]?.id ?? null
  );
  const [eventSearch, setEventSearch] = useState("");
  const [busyBranch, setBusyBranch] = useState<BranchCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = useMemo(
    () => allEvents.find((e) => e.id === selectedEventId) ?? null,
    [allEvents, selectedEventId]
  );

  const overridesForEvent = useMemo(() => {
    if (!selectedEventId) return [] as EventBranchOverride[];
    return overrides.filter((o) => o.eventId === selectedEventId);
  }, [overrides, selectedEventId]);

  const overrideByBranch = useMemo(() => {
    const m = new Map<BranchCode, EventBranchOverride>();
    for (const o of overridesForEvent) m.set(o.branchCode, o);
    return m;
  }, [overridesForEvent]);

  const filteredEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    if (!q) return sortedEvents;
    return sortedEvents.filter(
      (e) => e.name.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q)
    );
  }, [sortedEvents, eventSearch]);

  async function handleToggle(branch: BranchCode) {
    if (!selectedEventId) return;
    const ov = overrideByBranch.get(branch);
    setBusyBranch(branch);
    setError(null);
    try {
      if (ov) {
        await revokeOverride(selectedEventId, branch);
      } else {
        // No reason prompt — direct click-to-unlock.
        await grantOverride({ eventId: selectedEventId, branchCode: branch });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyBranch(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Multi-Grade Exceptions"
      title="Unlock per-branch backlog invites"
      description="Pick an event and tap any branch to give it permission to invite the same student to multiple grades on the same day (different sessions)."
      size="xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-5">
        {/* ── Left rail: event picker ─────────────────────────────────── */}
        <aside className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="fa-mono text-[10px] uppercase text-gold-600" style={{ letterSpacing: "0.12em" }}>
            Select event
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
            <input
              className="fa-input fa-input-icon-left rounded-full text-xs"
              style={{ height: "32px" }}
              placeholder="Search events…"
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
            />
          </div>

          {filteredEvents.length === 0 ? (
            <div className="text-xs text-ink-400 italic p-3">No events match.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredEvents.map((ev) => {
                const ovCount = overrides.filter((o) => o.eventId === ev.id).length;
                const isSelected = ev.id === selectedEventId;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`text-left p-2.5 rounded-[10px] border transition-colors ${
                      isSelected
                        ? "border-gold-500 bg-gold-50"
                        : "border-ivory-300 bg-white hover:border-gold-300 hover:bg-ivory-100/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink-900 truncate">{ev.name}</div>
                        <div className="text-[10px] fa-mono text-ink-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {new Date(ev.startDate).toLocaleDateString()}
                          <span className="text-ink-300">·</span>
                          <span className="uppercase">{ev.status}</span>
                        </div>
                      </div>
                      {ovCount > 0 && (
                        <span className="fa-mono text-[10px] px-1.5 py-0.5 rounded bg-gold-500 text-ivory-50 font-semibold flex-shrink-0">
                          {ovCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* ── Right: branch toggles for the selected event ─────────────── */}
        <section className="border-l border-ivory-300 pl-5">
          {!selectedEvent ? (
            <div className="text-sm text-ink-400 italic p-6 text-center">
              Pick an event on the left to manage its branch overrides.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div
                    className="fa-mono text-[10px] uppercase text-gold-600 mb-1"
                    style={{ letterSpacing: "0.12em" }}
                  >
                    Branches for
                  </div>
                  <h3 className="fa-display text-xl text-ink-900 leading-tight">{selectedEvent.name}</h3>
                  <div className="fa-mono text-[11px] text-ink-400 mt-1">
                    {new Date(selectedEvent.startDate).toLocaleDateString()}
                    <span className="mx-2">·</span>
                    {selectedEvent.venue}
                  </div>
                </div>
                <div
                  className={`fa-mono text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
                    overridesForEvent.length > 0
                      ? "bg-gold-500 text-ivory-50"
                      : "bg-ivory-200 text-ink-500"
                  }`}
                >
                  {overridesForEvent.length} / {BRANCHES.length} unlocked
                </div>
              </div>

              {error && (
                <div className="mb-3 p-2 rounded-[6px] bg-danger-soft text-danger text-xs">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {BRANCHES.map((b) => {
                  const branch = b.code as BranchCode;
                  const ov = overrideByBranch.get(branch);
                  const unlocked = !!ov;
                  const busy = busyBranch === branch;
                  return (
                    <button
                      key={branch}
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggle(branch)}
                      title={
                        unlocked && ov
                          ? `${b.name} — unlocked by ${ov.grantedBy} on ${new Date(ov.grantedAt).toLocaleDateString()}\nClick to lock again.`
                          : `${b.name} — click to unlock multi-grade invites for this branch`
                      }
                      className={`inline-flex items-center gap-1.5 fa-mono text-[11px] uppercase px-3 py-2 rounded-[8px] border transition-all min-w-[72px] justify-center ${
                        unlocked
                          ? "bg-gold-500 text-ivory-50 border-gold-600 shadow-sm hover:bg-gold-600"
                          : "bg-white text-ink-600 border-ivory-300 hover:border-gold-400 hover:bg-gold-50"
                      } ${busy ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                    >
                      {unlocked ? (
                        <ShieldCheck className="w-3 h-3" />
                      ) : (
                        <KeyRound className="w-3 h-3 opacity-40" />
                      )}
                      {branch}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-gold-200 text-[11px] text-ink-500">
                Tap a white chip to <strong className="text-ink-700">unlock</strong> a branch · tap a gold chip
                to <strong className="text-ink-700">lock</strong> it again. Changes apply immediately.
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
