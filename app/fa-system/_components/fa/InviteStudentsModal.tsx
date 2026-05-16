"use client";

import { useState, useMemo } from "react";
import { Search, Check } from "lucide-react";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { Modal } from "@fa/_components/shared/Modal";
import { StatusPill } from "@fa/_components/fa/StatusPill";
import { Invitation, Session, isStudentEligible, hasBacklog, invitableGradesFor, FA_CURRENT_GRADE_MIN_CHAPTER } from "@fa/_types";

export interface InvitePick {
  studentId: string;
  targetGrade: number;
}

export function InviteStudentsModal({
  open, onClose, session, quota, currentInvitations, allInvitationsForEvent, onInvite,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  /** Marketing-set confirm target for this session/branch. Invite cap is 3× this. */
  quota: number;
  currentInvitations: Invitation[];
  allInvitationsForEvent: Invitation[];
  onInvite: (picks: InvitePick[]) => void;
}) {
  const user = useCurrentUser();
  const allStudents = useFAStore(s => s.students);
  const students = useMemo(
    () => allStudents.filter(st => st.branch === user?.branch),
    [allStudents, user?.branch]
  );

  const [search, setSearch] = useState("");
  const [picks, setPicks] = useState<Map<string, number>>(new Map());
  const [filterMode, setFilterMode] = useState<"eligible" | "all">("eligible");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");

  const inviteCap = quota * 3;
  const remaining = inviteCap - currentInvitations.length;
  const alreadyInEvent = new Set(allInvitationsForEvent.map(i => i.studentId));

  const visibleStudents = useMemo(() => {
    let list = students.filter(s => s.active);
    if (filterMode === "eligible") list = list.filter(s => isStudentEligible(s));
    if (gradeFilter !== "all") list = list.filter(s => s.grade === gradeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        s => s.name.toLowerCase().includes(q) ||
             s.id.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      const ae = isStudentEligible(a) ? 0 : 1;
      const be = isStudentEligible(b) ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.name.localeCompare(b.name);
    });
  }, [students, search, filterMode, gradeFilter]);

  function pickGrade(studentId: string, grade: number) {
    setPicks(prev => {
      const next = new Map(prev);
      const current = next.get(studentId);
      if (current === grade) {
        next.delete(studentId);
      } else {
        if (current === undefined && next.size >= remaining) return prev;
        next.set(studentId, grade);
      }
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invite students — Day ${session.dayNumber} Session ${session.sessionNumber}`}
      description={`${session.startTime}–${session.endTime}${session.label ? ` · ${session.label}` : ""} · ${remaining} of ${inviteCap} invite slots open (target: ${quota} confirmed)`}
      size="xl"
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            className="fa-input fa-input-icon-left"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="fa-input w-32"
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          aria-label="Filter by grade"
        >
          <option value="all">All grades</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(g => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-ivory-200 p-1 rounded-lg">
          <button
            onClick={() => setFilterMode("eligible")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filterMode === "eligible" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
            }`}
          >
            Eligible only
          </button>
          <button
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filterMode === "all" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
            }`}
          >
            All active
          </button>
        </div>

        <div className="text-sm text-ink-500">
          <strong className="text-ink-900">{picks.size}</strong> / {remaining} selected
        </div>
      </div>

      {/* List */}
      <div className="max-h-[50vh] overflow-y-auto">
        {visibleStudents.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">
            No students match.
          </div>
        ) : (
          <div className="space-y-1">
            {visibleStudents.map(student => {
              const eligible = isStudentEligible(student);
              const backlog = hasBacklog(student);
              const pickedGrade = picks.get(student.id);
              const isSelected = pickedGrade !== undefined;
              const alreadyInvited = alreadyInEvent.has(student.id);
              const capReached = !isSelected && picks.size >= remaining;
              return (
                <div
                  key={student.id}
                  className={`w-full flex items-start gap-3 p-3 rounded-[10px] border text-left transition-all ${
                    isSelected
                      ? "border-brand-600 bg-brand-50"
                      : alreadyInvited
                        ? "border-ivory-300 bg-ivory-100 opacity-60"
                        : "border-ivory-300 bg-white"
                  }`}
                >
                  <div
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      isSelected ? "border-brand-600 bg-brand-600" : "border-ink-200 bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink-900">{student.name}</span>
                      <span className="font-mono text-xs text-ink-400">G{student.grade}·C{student.credit}</span>
                      {eligible && !alreadyInvited && (
                        <StatusPill tone="success" showDot={false}>Eligible</StatusPill>
                      )}
                      {!eligible && (
                        <StatusPill tone="neutral" showDot={false}>Inactive</StatusPill>
                      )}
                      {backlog && (
                        <StatusPill tone="warning" showDot={false}>Has backlog</StatusPill>
                      )}
                      {alreadyInvited && (
                        <StatusPill tone="info" showDot={false}>Already invited</StatusPill>
                      )}
                    </div>
                    <div className="text-xs text-ink-400 mt-1 flex items-center gap-2">
                      <span>{student.parentName}</span>
                      <span>·</span>
                      <span className="font-mono">{student.parentPhone}</span>
                    </div>

                    {!alreadyInvited && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                          Pick grade to appraise
                        </div>
                        {(() => {
                          // Past grades are always invitable; the current
                          // grade only joins the list once the student
                          // reaches C9 (the classroom-side eligibility rule).
                          const grades = invitableGradesFor(student);
                          if (grades.length === 0) {
                            return (
                              <div className="text-[11px] text-ink-400 italic">
                                Not yet at C{FA_CURRENT_GRADE_MIN_CHAPTER} of G{student.grade} —
                                FA tickbox unlocks once the student reaches it.
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1 flex-wrap">
                              {grades.map(g => {
                                const done = student.faHistory[g] === true;
                                const isPicked = pickedGrade === g;
                                const disabled = capReached && !isPicked;
                                const baseCls = isPicked
                                  ? "bg-brand-600 text-white border-brand-600 ring-2 ring-brand-200"
                                  : done
                                    ? "bg-success-soft text-success border-success/30 hover:border-success"
                                    : "bg-danger-soft text-danger border-danger/30 hover:border-danger";
                                const marker = isPicked ? "✓" : done ? "✓" : "✗";
                                return (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={() => pickGrade(student.id, g)}
                                    disabled={disabled}
                                    title={`Grade ${g}: ${done ? "completed" : "not yet"}`}
                                    className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${baseCls} ${
                                      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                                    }`}
                                  >
                                    G{g} {marker}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 mt-4 border-t border-ivory-300">
        <div className="text-xs text-ink-400">
          Showing <strong className="text-ink-600">{visibleStudents.length}</strong> student{visibleStudents.length !== 1 ? "s" : ""}
          {filterMode === "eligible" && <> with at least one prior grade (eligible)</>}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="fa-btn-secondary">Cancel</button>
          <button
            onClick={() =>
              onInvite(
                Array.from(picks.entries()).map(([studentId, targetGrade]) => ({
                  studentId,
                  targetGrade,
                }))
              )
            }
            disabled={picks.size === 0}
            className="fa-btn-primary"
          >
            Invite {picks.size > 0 && `${picks.size} student${picks.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

