"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Award, ChevronRight, Clock } from "lucide-react";
import { Modal } from "@fa/_components/shared/Modal";
import { useFAStore } from "@fa/_lib/store";
import { FAEvent, Invitation, Session, Student } from "@fa/_types";
import { formatDateRange } from "@fa/_lib/date";

type View = "sessions" | "students" | "preview";

interface Props {
  open: boolean;
  onClose: () => void;
  event: FAEvent;
  /** When provided, the wizard opens at the student picker for that session.
   *  When null, opens at the session picker. */
  initialSessionId?: string | null;
}

export function CertificatePreviewModal({ open, onClose, event, initialSessionId }: Props) {
  const allSessions = useFAStore(s => s.sessions);
  const allInvitations = useFAStore(s => s.invitations);
  const allStudents = useFAStore(s => s.students);

  // Initialise state from the prop. The parent conditionally mounts this
  // modal so each open is a fresh component instance — no useEffect needed.
  const [view, setView] = useState<View>(initialSessionId ? "students" : "sessions");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [studentInv, setStudentInv] = useState<Invitation | null>(null);

  const eventSessions = useMemo(
    () => allSessions
      .filter(s => s.eventId === event.id)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber),
    [allSessions, event.id]
  );

  // Per-session expected-attendee counts for the session picker view.
  const sessionExpectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of eventSessions) {
      counts[s.id] = allInvitations.filter(
        i => i.sessionId === s.id && (i.status === "confirmed" || i.status === "attended")
      ).length;
    }
    return counts;
  }, [eventSessions, allInvitations]);

  const selectedSession = sessionId
    ? eventSessions.find(s => s.id === sessionId) ?? null
    : null;

  // Attendees for the currently picked session — used by the student-picker view.
  const sessionAttendees = useMemo(() => {
    if (!selectedSession) return [];
    return allInvitations
      .filter(i => i.sessionId === selectedSession.id && (i.status === "confirmed" || i.status === "attended"))
      .map(i => ({ inv: i, student: allStudents.find(s => s.id === i.studentId) ?? null }))
      .filter((x): x is { inv: Invitation; student: Student } => x.student !== null)
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [selectedSession, allInvitations, allStudents]);

  const previewStudent = studentInv
    ? allStudents.find(s => s.id === studentInv.studentId) ?? null
    : null;
  const previewSession = studentInv
    ? eventSessions.find(s => s.id === studentInv.sessionId) ?? null
    : null;

  const titleByView: Record<View, string> = {
    sessions: "Browse certificates",
    students: selectedSession
      ? `Day ${selectedSession.dayNumber} · Session ${selectedSession.sessionNumber}`
      : "Choose a session",
    preview: previewStudent ? previewStudent.name : "Certificate preview",
  };
  const descByView: Record<View, string> = {
    sessions: "Pick a session to see the students who'll receive certificates.",
    students: "Pick a student to preview their certificate.",
    preview: "Use Ctrl+P to save this certificate as a PDF.",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      kicker="Certificates"
      title={titleByView[view]}
      description={descByView[view]}
      size="lg"
    >
      {view === "sessions" && (
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {eventSessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-400">No sessions scheduled.</div>
          ) : (
            eventSessions.map(s => {
              const count = sessionExpectedCounts[s.id] ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSessionId(s.id); setView("students"); }}
                  className="w-full flex items-center gap-3 p-3 rounded-[10px] border border-ivory-300 bg-white hover:border-gold-400 hover:bg-ivory-100/60 text-left transition-colors"
                >
                  <span className="flex-shrink-0 fa-mono text-xs font-semibold text-ink-700 bg-ivory-200 px-2 py-1 rounded">
                    D{s.dayNumber}·S{s.sessionNumber}
                  </span>
                  <Clock className="w-3 h-3 text-ink-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900">
                      {s.startTime}–{s.endTime}
                      {s.label && <span className="text-ink-500 ml-2 font-normal">· {s.label}</span>}
                    </div>
                  </div>
                  <span className="fa-mono text-sm text-ink-700">{count}</span>
                  <ChevronRight className="w-4 h-4 text-ink-400" />
                </button>
              );
            })
          )}
        </div>
      )}

      {view === "students" && selectedSession && (
        <div>
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
            <button
              type="button"
              onClick={() => { setView("sessions"); setStudentInv(null); }}
              className="fa-btn-ghost text-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> All sessions
            </button>
            <div className="text-xs text-ink-500 ml-auto">
              {sessionAttendees.length} certificate{sessionAttendees.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
            {sessionAttendees.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-400">
                No expected attendees in this session yet.
              </div>
            ) : (
              sessionAttendees.map(({ inv, student }) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 p-3 rounded-[10px] border border-ivory-300 bg-white"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900">{student.name}</div>
                    <div className="text-xs text-ink-400 mt-0.5 flex items-center gap-1.5">
                      <span className="font-mono">G{inv.targetGrade && inv.targetGrade > 0 ? inv.targetGrade : student.grade}</span>
                      <span>·</span>
                      <span className="font-mono text-xs font-semibold bg-ivory-200 px-1.5 py-0.5 rounded">
                        {inv.branch}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStudentInv(inv); setView("preview"); }}
                    className="fa-btn-secondary text-xs"
                  >
                    <Award className="w-3.5 h-3.5" /> Preview
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {view === "preview" && previewStudent && previewSession && (
        <div>
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ivory-300">
            <button
              type="button"
              onClick={() => { setStudentInv(null); setView("students"); }}
              className="fa-btn-ghost text-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to students
            </button>
          </div>
          <CertificateRender
            student={previewStudent}
            grade={studentInv && studentInv.targetGrade > 0 ? studentInv.targetGrade : previewStudent.grade}
            session={previewSession}
            event={event}
          />
          {typeof document !== "undefined" && createPortal(
            <div className="fa-print-cert">
              <CertificateRender
                student={previewStudent}
                grade={studentInv && studentInv.targetGrade > 0 ? studentInv.targetGrade : previewStudent.grade}
                session={previewSession}
                event={event}
              />
            </div>,
            document.body
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── Certificate render ─────────────────────────────────────────────────── */
function CertificateRender({
  student, grade, session, event,
}: { student: Student; grade: number; session: Session; event: FAEvent }) {
  return (
    <div
      className="bg-ivory-50 p-10 border-2 border-double border-gold-400 rounded-[10px] text-center"
      style={{
        boxShadow: "inset 0 0 0 4px var(--color-ivory-50), inset 0 0 0 6px var(--color-gold-300)",
      }}
    >
      <div className="fa-mono text-[10px] uppercase text-gold-600 mb-2" style={{ letterSpacing: "0.3em" }}>
        Certificate of Participation
      </div>
      <div className="fa-display-italic text-5xl text-ink-900 leading-none mb-2">
        Ebright
      </div>
      <div className="fa-mono text-[10px] uppercase text-ink-500 mb-6" style={{ letterSpacing: "0.18em" }}>
        Foundation Appraisal
      </div>

      <hr className="border-0 border-t border-gold-300 mb-6" />

      <div className="text-sm text-ink-600 mb-2 italic">This is to certify that</div>
      <div className="fa-display text-4xl text-ink-900 mb-3">{student.name}</div>
      <div className="text-sm text-ink-600 mb-1">has successfully participated in the</div>
      <div className="fa-display text-2xl text-gold-700 mb-6">
        Grade {grade} Foundation Appraisal
      </div>

      <hr className="border-0 border-t border-gold-300 mb-4" />

      <div className="text-xs text-ink-500 mb-1">{event.name}</div>
      <div className="text-xs text-ink-500 mb-1">
        {formatDateRange(event.startDate, event.endDate)} · {event.venue}
      </div>
      <div className="fa-mono text-[10px] uppercase text-ink-400 mb-12" style={{ letterSpacing: "0.12em" }}>
        Day {session.dayNumber} · Session {session.sessionNumber} · {session.startTime}–{session.endTime}
      </div>

      <div className="flex justify-end">
        <div className="text-xs text-ink-500 border-t border-ink-300 pt-1 inline-block px-10 italic">
          Authorised Signature
        </div>
      </div>
    </div>
  );
}
