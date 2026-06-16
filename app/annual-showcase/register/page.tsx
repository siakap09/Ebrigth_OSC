"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ActiveWaveData {
  closed: boolean;
  reason?: "deadline_passed" | "no_active_wave";
  isFull?: boolean;
  wave?: { id: string; name: string; amount: number; deadline: string; daysLeft: number };
  waitlistEnabled?: boolean;
  participantTarget?: number;
  participantCount?: number;
}

interface Edition {
  id: string;
  name: string;
  theme: string;
  startDate: string | null;
  endDate:   string | null;
  venueName: string | null;
  currency:  string;
  registrationDeadline: string | null;
  categories: { id: string; name: string }[];
  feeWaves:   { id: string; name: string; amount: number; deadline: string }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "TBD";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [edition,    setEdition   ] = useState<Edition | null>(null);
  const [waveData,   setWaveData  ] = useState<ActiveWaveData | null>(null);
  const [loading,    setLoading   ] = useState(true);

  // Registration form
  const [form, setForm] = useState({
    fullName: "", dateOfBirth: "", parentName: "", parentEmail: "", parentPhone: "",
    categoryId: "", isEbrighter: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted ] = useState(false);

  // Waitlist form
  const [wlForm, setWlForm] = useState({ name: "", email: "", phone: "" });
  const [wlSubmitting, setWlSubmitting] = useState(false);
  const [wlSubmitted,  setWlSubmitted ] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Fetch the active edition
        const edRes = await fetch("/api/annual-showcase/editions?active=true");
        if (!edRes.ok) { setLoading(false); return; }
        const ed = await edRes.json() as Edition | null;
        if (!ed) { setLoading(false); return; }
        setEdition(ed);

        // Fetch active wave info
        const wRes = await fetch(`/api/annual-showcase/editions/${ed.id}/active-wave`);
        if (wRes.ok) setWaveData(await wRes.json() as ActiveWaveData);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!edition || !form.fullName.trim() || !form.parentEmail.trim()) {
      toast.error("Name and parent email are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${edition.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:    form.fullName.trim(),
          dateOfBirth: form.dateOfBirth || undefined,
          parentName:  form.parentName  || undefined,
          parentEmail: form.parentEmail.trim(),
          parentPhone: form.parentPhone || undefined,
          categoryId:  form.categoryId  || undefined,
          isEbrighter: form.isEbrighter,
          feeWaveId:   waveData?.wave?.id,
          paymentStatus: "UNPAID",
        }),
      });
      if (!res.ok) {
        const msg = (await res.json() as { error?: string }).error ?? "Registration failed";
        throw new Error(msg);
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!edition) return;
    setWlSubmitting(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${edition.id}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wlForm),
      });
      if (!res.ok) throw new Error("Failed");
      setWlSubmitted(true);
    } catch { toast.error("Failed to join waitlist"); }
    finally { setWlSubmitting(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Loading registration...</p>
        </div>
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <span className="text-5xl">🎤</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Registration Not Available</h1>
          <p className="text-gray-500 mt-2">No active edition found. Please check back later.</p>
        </div>
      </div>
    );
  }

  const isClosed = waveData?.closed;
  const isFull   = waveData?.isFull;
  const showWaitlist = isFull && waveData?.waitlistEnabled;

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <span className="text-5xl">🎉</span>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Registration Received!</h2>
          <p className="text-gray-500 mt-2 text-sm">
            Thank you for registering <strong>{form.fullName}</strong> for <strong>{edition.name}</strong>.
            A confirmation will be sent to {form.parentEmail}.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Fee: {edition.currency} {waveData?.wave?.amount.toFixed(2) ?? "—"} ({waveData?.wave?.name ?? "—"})
          </p>
        </div>
      </div>
    );
  }

  if (wlSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <span className="text-5xl">📋</span>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Added to Waitlist!</h2>
          <p className="text-gray-500 mt-2 text-sm">
            We&apos;ll notify you at <strong>{wlForm.email}</strong> if a spot opens up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-gray-900">{edition.name}</h1>
          <p className="text-purple-600 font-medium">{edition.theme}</p>
          <p className="text-sm text-gray-400">
            {fmt(edition.startDate)} · {edition.venueName ?? "Venue TBD"}
          </p>
        </div>

        {/* Wave / Status Banner */}
        {isClosed ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="font-semibold text-red-700">Registration Closed</p>
            <p className="text-xs text-red-500 mt-1">
              {waveData?.reason === "deadline_passed" ? "The registration deadline has passed." : "No active registration wave."}
            </p>
          </div>
        ) : isFull ? (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="font-semibold text-orange-700">Registration Full</p>
            <p className="text-xs text-orange-500 mt-1">
              {edition.name} has reached its capacity of {waveData?.participantTarget} participants.
              {showWaitlist && " Join the waitlist below."}
            </p>
          </div>
        ) : waveData?.wave ? (
          <div className="bg-purple-600 text-white rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">{waveData.wave.name} pricing</p>
              <p className="text-2xl font-bold">{edition.currency} {waveData.wave.amount.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-80">Ends in</p>
              <p className="text-lg font-semibold">{waveData.wave.daysLeft} day{waveData.wave.daysLeft !== 1 ? "s" : ""}</p>
              <p className="text-xs opacity-70">{fmt(waveData.wave.deadline)}</p>
            </div>
          </div>
        ) : null}

        {/* Waitlist form */}
        {showWaitlist && !isClosed ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Join Waitlist</h2>
            <form onSubmit={handleWaitlist} className="space-y-3">
              <Input placeholder="Your name" value={wlForm.name} onChange={e => setWlForm(p => ({ ...p, name: e.target.value }))} required />
              <Input type="email" placeholder="Email address" value={wlForm.email} onChange={e => setWlForm(p => ({ ...p, email: e.target.value }))} required />
              <Input placeholder="Phone (optional)" value={wlForm.phone} onChange={e => setWlForm(p => ({ ...p, phone: e.target.value }))} />
              <Button type="submit" disabled={wlSubmitting} className="w-full bg-yellow-500 hover:bg-yellow-600">
                {wlSubmitting ? "Joining..." : "Join Waitlist"}
              </Button>
            </form>
          </div>
        ) : !isClosed && !isFull ? (
          /* Registration form */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Participant Registration</h2>
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Participant Name *</label>
                <Input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} required placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                <Input type="date" value={form.dateOfBirth} onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} />
              </div>
              {edition.categories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={form.categoryId}
                    onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Auto-detect from age</option>
                    {edition.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isEb" checked={form.isEbrighter} onChange={e => setForm(p => ({ ...p, isEbrighter: e.target.checked }))} className="rounded" />
                <label htmlFor="isEb" className="text-sm text-gray-700">Is an Ebrighter</label>
              </div>
              <hr className="border-gray-100" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parent / Guardian</p>
              <Input placeholder="Parent name *" value={form.parentName} onChange={e => setForm(p => ({ ...p, parentName: e.target.value }))} required />
              <Input type="email" placeholder="Parent email *" value={form.parentEmail} onChange={e => setForm(p => ({ ...p, parentEmail: e.target.value }))} required />
              <Input placeholder="Parent phone" value={form.parentPhone} onChange={e => setForm(p => ({ ...p, parentPhone: e.target.value }))} />
              <Button type="submit" disabled={submitting} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                {submitting ? "Registering..." : "Register"}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
