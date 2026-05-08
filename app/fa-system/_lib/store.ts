// ============================================================================
// FA System — Zustand Store
//
// Events, sessions, quotas, and invitations are server-backed (DB on
// ebrightleads_db). Mutators call API routes; local state mirrors what the
// server returns so all logged-in users see the same data.
//
// Sessions display order, inventory packing checklist, and walk-in buffer
// remain local-only (UI preferences) and persist to localStorage.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  FAEvent,
  Invitation,
  InvitationStatus,
  Session,
  SessionQuota,
  Student,
  User,
  BranchCode,
} from "@fa/_types";
import { MOCK_USERS } from "./mockData";

interface FAStore {
  // ------- Data -------
  users: User[];
  students: Student[];
  events: FAEvent[];
  sessions: Session[];
  quotas: SessionQuota[];
  invitations: Invitation[];

  // ------- Auth -------
  currentUserId: string | null;
  login: (userId: string) => void;
  logout: () => void;

  // ------- Student data loading (real DB) -------
  studentsLoaded: boolean;
  studentsLoading: boolean;
  studentsError: string | null;
  loadStudents: () => Promise<void>;

  // ------- Event data loading (real DB) -------
  eventsLoaded: boolean;
  eventsLoading: boolean;
  eventsError: string | null;
  loadEvents: () => Promise<void>;

  // ------- Event CRUD -------
  createEvent: (ev: Omit<FAEvent, "id" | "createdAt">) => Promise<FAEvent>;
  updateEvent: (id: string, patch: Partial<FAEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  // ------- Session CRUD -------
  createSession: (s: Omit<Session, "id">) => Promise<Session>;
  updateSession: (id: string, patch: Partial<Session>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // ------- Quota CRUD -------
  setQuota: (sessionId: string, branch: BranchCode, quota: number) => Promise<void>;
  removeQuota: (sessionId: string, branch: BranchCode) => Promise<void>;

  // ------- Invitation CRUD -------
  /** Create an invitation. Returns null if rejected (already invited / quota
   *  full / event closed). The server enforces all three rules; the result
   *  shape mirrors the original local-only behaviour. */
  inviteStudent: (args: {
    eventId: string;
    sessionId: string;
    studentId: string;
    branch: BranchCode;
    invitedBy: string;
    initialStatus?: InvitationStatus;
    allowOverQuota?: boolean;
  }) => Promise<Invitation | null>;
  updateInvitationStatus: (id: string, status: InvitationStatus, by?: string) => Promise<void>;
  removeInvitation: (id: string) => Promise<void>;
  moveInvitationToSession: (invitationId: string, targetSessionId: string) => Promise<void>;

  // ------- Display order (per session) — local-only -------
  sessionOrder: Record<string, string[]>;
  setSessionOrder: (sessionId: string, invitationIds: string[]) => void;

  // ------- Inventory packing checklist — local-only -------
  packedItems: Record<string, string[]>;
  togglePackedItem: (eventId: string, itemKey: string) => void;
  walkInBuffer: Record<string, Record<number, number>>;
  setWalkInBufferForGrade: (eventId: string, grade: number, n: number) => void;

  // ------- Utilities -------
  resetToSeed: () => void;
}

// ----------------------------------------------------------------------------
// API helpers
// ----------------------------------------------------------------------------

async function apiJson<T>(
  url: string,
  init: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: unknown }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {}
    return { ok: false, status: res.status, body };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}

export const useFAStore = create<FAStore>()(
  persist(
    (set, get) => ({
      users: MOCK_USERS,
      students: [],
      events: [],
      sessions: [],
      quotas: [],
      invitations: [],
      sessionOrder: {},
      packedItems: {},
      walkInBuffer: {},
      currentUserId: null,
      studentsLoaded: false,
      studentsLoading: false,
      studentsError: null,
      eventsLoaded: false,
      eventsLoading: false,
      eventsError: null,

      login: (userId) => set({ currentUserId: userId }),
      logout: () => set({ currentUserId: null }),

      // ------- Student data loading -------
      loadStudents: async () => {
        if (get().studentsLoading) return;
        set({ studentsLoading: true, studentsError: null });
        try {
          const res = await fetch("/api/fa/students", { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { students: Student[] };
          set({
            students: data.students,
            studentsLoaded: true,
            studentsLoading: false,
          });
        } catch (err) {
          set({
            studentsError: err instanceof Error ? err.message : "Unknown error",
            studentsLoading: false,
          });
        }
      },

      // ------- Event data loading (events + sessions + quotas + invitations) -------
      loadEvents: async () => {
        if (get().eventsLoading) return;
        set({ eventsLoading: true, eventsError: null });
        try {
          const res = await fetch("/api/fa/data", { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as {
            events: FAEvent[];
            sessions: Session[];
            quotas: SessionQuota[];
            invitations: Invitation[];
          };
          set({
            events: data.events,
            sessions: data.sessions,
            quotas: data.quotas,
            invitations: data.invitations,
            eventsLoaded: true,
            eventsLoading: false,
          });
        } catch (err) {
          set({
            eventsError: err instanceof Error ? err.message : "Unknown error",
            eventsLoading: false,
          });
        }
      },

      // ------- Events -------
      createEvent: async (ev) => {
        const r = await apiJson<FAEvent>("/api/fa/events", {
          method: "POST",
          body: JSON.stringify(ev),
        });
        if (!r.ok) {
          const detail = (r.body as { error?: string })?.error;
          throw new Error(
            `Create event failed (HTTP ${r.status})${detail ? ": " + detail : ""}`
          );
        }
        const newEvent = r.data;
        set((s) => ({ events: [...s.events, newEvent] }));
        return newEvent;
      },

      updateEvent: async (id, patch) => {
        const r = await apiJson<FAEvent>(`/api/fa/events/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`Update event failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? updated : e)),
        }));
      },

      deleteEvent: async (id) => {
        const r = await apiJson<{ ok: true }>(`/api/fa/events/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`Delete event failed (HTTP ${r.status})`);
        // Server cascades; mirror locally.
        const sessionIds = get().sessions.filter((s) => s.eventId === id).map((s) => s.id);
        set((s) => ({
          events: s.events.filter((e) => e.id !== id),
          sessions: s.sessions.filter((ss) => ss.eventId !== id),
          quotas: s.quotas.filter((q) => !sessionIds.includes(q.sessionId)),
          invitations: s.invitations.filter((i) => i.eventId !== id),
        }));
      },

      // ------- Sessions -------
      createSession: async (sess) => {
        const r = await apiJson<Session>("/api/fa/sessions", {
          method: "POST",
          body: JSON.stringify(sess),
        });
        if (!r.ok) throw new Error(`Create session failed (HTTP ${r.status})`);
        const newSession = r.data;
        set((s) => ({ sessions: [...s.sessions, newSession] }));
        return newSession;
      },

      updateSession: async (id, patch) => {
        const r = await apiJson<Session>(`/api/fa/sessions/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`Update session failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          sessions: s.sessions.map((ss) => (ss.id === id ? updated : ss)),
        }));
      },

      deleteSession: async (id) => {
        const r = await apiJson<{ ok: true }>(`/api/fa/sessions/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`Delete session failed (HTTP ${r.status})`);
        set((s) => ({
          sessions: s.sessions.filter((ss) => ss.id !== id),
          quotas: s.quotas.filter((q) => q.sessionId !== id),
          invitations: s.invitations.filter((i) => i.sessionId !== id),
        }));
      },

      // ------- Quotas -------
      setQuota: async (sessionId, branch, quota) => {
        const r = await apiJson<{ quota: SessionQuota | null }>("/api/fa/quotas", {
          method: "PUT",
          body: JSON.stringify({ sessionId, branch, quota }),
        });
        if (!r.ok) throw new Error(`Set quota failed (HTTP ${r.status})`);
        const result = r.data.quota;
        set((s) => {
          const without = s.quotas.filter(
            (q) => !(q.sessionId === sessionId && q.branch === branch)
          );
          return { quotas: result ? [...without, result] : without };
        });
      },

      removeQuota: async (sessionId, branch) => {
        await get().setQuota(sessionId, branch, 0);
      },

      // ------- Invitations -------
      inviteStudent: async ({
        eventId,
        sessionId,
        studentId,
        branch,
        invitedBy,
        initialStatus,
        allowOverQuota,
      }) => {
        const r = await apiJson<{ invitation: Invitation | null; reason?: string }>(
          "/api/fa/invitations",
          {
            method: "POST",
            body: JSON.stringify({
              eventId,
              sessionId,
              studentId,
              branch,
              invitedBy,
              initialStatus,
              allowOverQuota,
            }),
          }
        );
        // 409 = business rule rejection; surface as `null` like the old store
        // so existing call sites that check `if (!created)` keep working.
        if (!r.ok && r.status === 409) return null;
        if (!r.ok && r.status === 404) return null;
        if (!r.ok) throw new Error(`Invite failed (HTTP ${r.status})`);
        const inv = r.data.invitation;
        if (!inv) return null;
        set((s) => ({ invitations: [...s.invitations, inv] }));
        return inv;
      },

      updateInvitationStatus: async (id, status, by) => {
        const r = await apiJson<Invitation>(`/api/fa/invitations/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status, markedBy: by }),
        });
        if (!r.ok) throw new Error(`Update invitation failed (HTTP ${r.status})`);
        const updated = r.data;
        set((s) => ({
          invitations: s.invitations.map((i) => (i.id === id ? updated : i)),
        }));
      },

      removeInvitation: async (id) => {
        const r = await apiJson<{ ok: true }>(`/api/fa/invitations/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`Remove invitation failed (HTTP ${r.status})`);
        set((s) => ({
          invitations: s.invitations.filter((i) => i.id !== id),
          sessionOrder: Object.fromEntries(
            Object.entries(s.sessionOrder).map(([sid, ids]) => [sid, ids.filter((x) => x !== id)])
          ),
        }));
      },

      moveInvitationToSession: async (invitationId, targetSessionId) => {
        const inv = get().invitations.find((i) => i.id === invitationId);
        if (!inv) return;
        const sourceSessionId = inv.sessionId;
        if (sourceSessionId === targetSessionId) return;

        const r = await apiJson<Invitation>(
          `/api/fa/invitations/${encodeURIComponent(invitationId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ sessionId: targetSessionId }),
          }
        );
        if (!r.ok) throw new Error(`Move invitation failed (HTTP ${r.status})`);
        const updated = r.data;

        set((s) => {
          const newInvitations = s.invitations.map((i) => (i.id === invitationId ? updated : i));
          const sourceOrder = (s.sessionOrder[sourceSessionId] ?? []).filter(
            (x) => x !== invitationId
          );
          const existingTarget = s.sessionOrder[targetSessionId] ?? [];
          const targetOrder = existingTarget.includes(invitationId)
            ? existingTarget
            : [...existingTarget, invitationId];
          return {
            invitations: newInvitations,
            sessionOrder: {
              ...s.sessionOrder,
              [sourceSessionId]: sourceOrder,
              [targetSessionId]: targetOrder,
            },
          };
        });
      },

      // ------- Display order -------
      setSessionOrder: (sessionId, invitationIds) => {
        set((s) => ({
          sessionOrder: { ...s.sessionOrder, [sessionId]: invitationIds },
        }));
      },

      // ------- Inventory packing checklist -------
      togglePackedItem: (eventId, itemKey) => {
        set((s) => {
          const current = s.packedItems[eventId] ?? [];
          const next = current.includes(itemKey)
            ? current.filter((k) => k !== itemKey)
            : [...current, itemKey];
          return { packedItems: { ...s.packedItems, [eventId]: next } };
        });
      },
      setWalkInBufferForGrade: (eventId, grade, n) => {
        set((s) => {
          const current = s.walkInBuffer[eventId] ?? {};
          const value = Math.max(0, Math.floor(n));
          const next = { ...current };
          if (value === 0) {
            delete next[grade];
          } else {
            next[grade] = value;
          }
          return { walkInBuffer: { ...s.walkInBuffer, [eventId]: next } };
        });
      },

      // ------- Utilities -------
      resetToSeed: () => {
        // Clear everything that comes from the server so the next load
        // re-hydrates fresh from the DB.
        set({
          users: MOCK_USERS,
          students: [],
          studentsLoaded: false,
          studentsError: null,
          events: [],
          sessions: [],
          quotas: [],
          invitations: [],
          eventsLoaded: false,
          eventsError: null,
          sessionOrder: {},
          packedItems: {},
          walkInBuffer: {},
          currentUserId: null,
        });
        void get().loadStudents();
        void get().loadEvents();
      },
    }),
    {
      // Bumped from v2 → v3: events/sessions/quotas/invitations are no longer
      // persisted (server is source of truth). The key change forces existing
      // browsers to drop their stale local data on first load.
      name: "fa-system-storage-v3",
      partialize: (s) => ({
        // Only persist UI-only state. Domain data lives on the server.
        sessionOrder: s.sessionOrder,
        packedItems: s.packedItems,
        walkInBuffer: s.walkInBuffer,
        currentUserId: s.currentUserId,
      }),
    }
  )
);

// ------- Selectors -------
export const selectEventById = (id: string) => (state: FAStore) =>
  state.events.find((e) => e.id === id);

export const selectSessionsForEvent = (eventId: string) => (state: FAStore) =>
  state.sessions
    .filter((s) => s.eventId === eventId)
    .sort((a, b) => a.dayNumber - b.dayNumber || a.sessionNumber - b.sessionNumber);

export const selectQuotasForSession = (sessionId: string) => (state: FAStore) =>
  state.quotas.filter((q) => q.sessionId === sessionId);

export const selectInvitationsForSession = (sessionId: string) => (state: FAStore) =>
  state.invitations.filter((i) => i.sessionId === sessionId);

export const selectInvitationsForEvent = (eventId: string) => (state: FAStore) =>
  state.invitations.filter((i) => i.eventId === eventId);

export const selectStudentsForBranch = (branch: BranchCode) => (state: FAStore) =>
  state.students.filter((s) => s.branch === branch);
