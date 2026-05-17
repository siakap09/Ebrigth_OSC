"use client";

import { useState, useMemo } from "react";
import { KeyRound, ChevronDown, ChevronUp, ShieldCheck, X } from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { BRANCHES, BranchCode, EventBranchOverride, FAEvent } from "@fa/_types";

interface Props {
  event: FAEvent;
}

/**
 * Per-event "multi-grade exceptions" toggle card. Visible only in the
 * Marketing event detail page; only Marketing/Admin emails can flip toggles
 * (the API enforces this — UI is just the friendly entrypoint).
 *
 * Toggling a branch ON for this event lets that branch invite the same
 * backlog student to multiple grades within the event (same day, different
 * sessions, different target_grade). Default for every branch is OFF, which
 * preserves the "one invite per student per event" rule.
 *
 * Visual: gold-bordered card with a key icon, two distinct chip states:
 *   • Locked   — muted ivory chip with branch code
 *   • Unlocked — solid brand-coloured chip with branch code + ✓
 * Hovering an unlocked chip surfaces the granter email + reason.
 */
export function MultiGradeExceptionsCard({ event }: Props) {
  const overrides = useFAStore((s) => s.eventBranchOverrides);
  const grantOverride = useFAStore((s) => s.grantEventBranchOverride);
  const revokeOverride = useFAStore((s) => s.revokeEventBranchOverride);

  const [expanded, setExpanded] = useState(false);
  const [busyBranch, setBusyBranch] = useState<BranchCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonPromptFor, setReasonPromptFor] = useState<BranchCode | null>(null);
  const [reasonText, setReasonText] = useState("");

  const overridesForEvent = useMemo(
    () => overrides.filter((o) => o.eventId === event.id),
    [overrides, event.id]
  );
  const overrideByBranch = useMemo(() => {
    const m = new Map<BranchCode, EventBranchOverride>();
    for (const o of overridesForEvent) m.set(o.branchCode, o);
    return m;
  }, [overridesForEvent]);

  const unlockedCount = overridesForEvent.length;

  async function handleGrant(branch: BranchCode, reason: string) {
    setBusyBranch(branch);
    setError(null);
    try {
      await grantOverride({ eventId: event.id, branchCode: branch, reason: reason || undefined });
      setReasonPromptFor(null);
      setReasonText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grant override");
    } finally {
      setBusyBranch(null);
    }
  }

  async function handleRevoke(branch: BranchCode) {
    setBusyBranch(branch);
    setError(null);
    try {
      await revokeOverride(event.id, branch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke override");
    } finally {
      setBusyBranch(null);
    }
  }

  return (
    <div className="fa-card border-2 border-gold-300 bg-gradient-to-br from-gold-50/50 to-ivory-50 p-5 mb-6 fa-enter fa-delay-2 relative overflow-hidden">
      {/* Decorative key motif in the corner */}
      <KeyRound
        className="absolute -right-4 -top-4 w-24 h-24 text-gold-100 rotate-12 pointer-events-none"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gold-500 text-ivory-50 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div
              className="fa-mono text-[10px] uppercase text-gold-600 mb-0.5"
              style={{ letterSpacing: "0.12em" }}
            >
              Multi-Grade Exceptions
            </div>
            <h3 className="fa-display text-lg text-ink-900 leading-tight">
              Unlock per-branch backlog invites
            </h3>
            <p className="text-xs text-ink-500 mt-0.5 max-w-md">
              By default each student can be invited once per event. Unlock a branch here to let them
              invite the <em>same</em> student to multiple grades on the same day (different sessions).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className={`fa-mono text-xs px-2.5 py-1 rounded-full font-semibold ${
              unlockedCount > 0
                ? "bg-gold-500 text-ivory-50"
                : "bg-ivory-200 text-ink-500"
            }`}
            aria-live="polite"
          >
            {unlockedCount} unlocked
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="fa-btn-secondary"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" /> Hide
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" /> Manage
              </>
            )}
          </button>
        </div>
      </div>

      {/* Compact view: just show unlocked branches as chips */}
      {!expanded && unlockedCount > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 relative">
          {overridesForEvent.map((o) => (
            <span
              key={o.branchCode}
              className="inline-flex items-center gap-1.5 fa-mono text-[11px] uppercase px-2.5 py-1 rounded-[6px] bg-gold-500 text-ivory-50 shadow-sm"
              title={
                `Unlocked by ${o.grantedBy} on ${new Date(o.grantedAt).toLocaleDateString()}` +
                (o.reason ? `\nReason: ${o.reason}` : "")
              }
            >
              <ShieldCheck className="w-3 h-3" />
              {o.branchCode}
            </span>
          ))}
        </div>
      )}

      {/* Expanded view: every branch as a clickable chip */}
      {expanded && (
        <div className="relative mt-3">
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
                  onClick={() => {
                    if (unlocked) handleRevoke(branch);
                    else setReasonPromptFor(branch);
                  }}
                  title={
                    unlocked && ov
                      ? `Unlocked by ${ov.grantedBy} · ${new Date(ov.grantedAt).toLocaleDateString()}` +
                        (ov.reason ? `\nReason: ${ov.reason}` : "")
                      : `${b.name} — click to unlock multi-grade invites for this branch`
                  }
                  className={`group inline-flex items-center gap-1.5 fa-mono text-[11px] uppercase px-2.5 py-1.5 rounded-[6px] border transition-all ${
                    unlocked
                      ? "bg-gold-500 text-ivory-50 border-gold-600 shadow-sm hover:bg-gold-600"
                      : "bg-white text-ink-600 border-ivory-300 hover:border-gold-400 hover:bg-gold-50"
                  } ${busy ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                >
                  {unlocked ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <KeyRound className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                  )}
                  {branch}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-gold-200 flex items-center justify-between text-[11px] text-ink-500">
            <span className="fa-mono">
              <strong className="text-ink-700">{unlockedCount}</strong> / {BRANCHES.length} branches unlocked
            </span>
            <span>
              Click a branch to {unlockedCount > 0 ? "lock/unlock" : "unlock"} it for this event
            </span>
          </div>
        </div>
      )}

      {/* Reason prompt — appears as an inline mini-modal */}
      {reasonPromptFor && (
        <div className="absolute inset-0 flex items-center justify-center bg-ivory-50/95 backdrop-blur-sm rounded-2xl z-10">
          <div className="w-full max-w-md bg-white rounded-2xl border-2 border-gold-300 shadow-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div
                  className="fa-mono text-[10px] uppercase text-gold-600 mb-1"
                  style={{ letterSpacing: "0.12em" }}
                >
                  Unlocking
                </div>
                <h4 className="fa-display text-lg text-ink-900">{reasonPromptFor}</h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReasonPromptFor(null);
                  setReasonText("");
                }}
                className="text-ink-400 hover:text-ink-700"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-xs text-ink-500 mb-1.5">
              Reason (optional — for the audit trail)
            </label>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="e.g. BM requested via WhatsApp — 2 backlog students need both G2 + G3"
              rows={3}
              className="fa-input w-full resize-none"
              autoFocus
              maxLength={500}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setReasonPromptFor(null);
                  setReasonText("");
                }}
                className="fa-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleGrant(reasonPromptFor, reasonText)}
                disabled={busyBranch === reasonPromptFor}
                className="fa-btn-primary"
              >
                {busyBranch === reasonPromptFor ? "Unlocking…" : "Unlock branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
