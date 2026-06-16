"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useActiveEdition } from "@/app/hooks/useActiveEdition";
import { useDepartmentAccess } from "@/app/hooks/useDepartmentAccess";
import ManpowerPanel from "@/app/components/annual-showcase/ManpowerPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface VenueItem {
  id: string;
  item: string;
  location: string;
  pic: string;
  status: "CONFIRMED" | "PENDING" | "ISSUE";
  notes: string;
}

interface VehicleItem {
  id: string;
  vehicleType: string;
  capacity: string;
  purpose: string;
  driver: string;
  pickupTime: string;
  status: "ARRANGED" | "PENDING" | "CANCELLED";
}

interface EquipmentItem {
  id: string;
  item: string;
  quantity: string;
  supplier: string;
  deliveryDate: string;
  collectedBy: string;
  status: "PENDING" | "DELIVERED" | "COLLECTED" | "RETURNED";
}

interface LogisticsData {
  venues:    VenueItem[];
  vehicles:  VehicleItem[];
  equipment: EquipmentItem[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const VENUE_STATUS_BADGE: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-700",
  PENDING:   "bg-yellow-100 text-yellow-700",
  ISSUE:     "bg-red-100 text-red-600",
};

const VEHICLE_STATUS_BADGE: Record<string, string> = {
  ARRANGED:  "bg-green-100 text-green-700",
  PENDING:   "bg-yellow-100 text-yellow-700",
  CANCELLED: "bg-red-100 text-red-600",
};

const EQUIPMENT_STATUS_BADGE: Record<string, string> = {
  PENDING:   "bg-yellow-100 text-yellow-700",
  DELIVERED: "bg-blue-100 text-blue-700",
  COLLECTED: "bg-green-100 text-green-700",
  RETURNED:  "bg-gray-100 text-gray-600",
};

type LogisticsTab = "manpower" | "venue" | "transport" | "equipment";

const TABS: { id: LogisticsTab; label: string }[] = [
  { id: "manpower",  label: "👥 Manpower" },
  { id: "venue",     label: "📍 Venue & Site" },
  { id: "transport", label: "🚌 Transportation" },
  { id: "equipment", label: "📦 Loading Bay & Equipment" },
];

function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ─── Venue & Site Tab ──────────────────────────────────────────────────────────

function VenueTab({ venues, onChange }: { venues: VenueItem[]; onChange: (v: VenueItem[]) => void }) {
  const [form, setForm] = useState<Partial<VenueItem>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  function startEdit(v: VenueItem) {
    setEditingId(v.id);
    setForm({ ...v });
  }

  function cancel() {
    setEditingId(null);
    setForm({});
  }

  function save() {
    if (!form.item?.trim()) { toast.error("Item is required"); return; }
    if (editingId) {
      onChange(venues.map(v => v.id === editingId ? { ...v, ...form } as VenueItem : v));
    } else {
      onChange([...venues, { id: newId(), item: "", location: "", pic: "", status: "PENDING", notes: "", ...form } as VenueItem]);
    }
    cancel();
  }

  function remove(id: string) {
    if (!window.confirm("Remove this venue item?")) return;
    onChange(venues.filter(v => v.id !== id));
  }

  function f(k: keyof VenueItem) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Venue & Site Setup</h3>
          {!editingId && (
            <Button size="sm" onClick={() => { setEditingId("new"); setForm({}); }} className="bg-cyan-600 hover:bg-cyan-700 text-xs">
              + Add Item
            </Button>
          )}
        </div>

        {(editingId) && (
          <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input placeholder="Item / Area *" value={form.item ?? ""} onChange={f("item")} />
              <Input placeholder="Location" value={form.location ?? ""} onChange={f("location")} />
              <Input placeholder="Person in Charge" value={form.pic ?? ""} onChange={f("pic")} />
              <div>
                <Select value={form.status ?? "PENDING"} onValueChange={(v) => setForm(p => ({ ...p, status: v as VenueItem["status"] }))}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="ISSUE">Issue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="Notes" value={form.notes ?? ""} onChange={f("notes")} className="col-span-2" />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
              <Button size="sm" variant="outline" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        )}

        {venues.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No venue items added yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Item / Area</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Location</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">PIC</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Notes</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {venues.map((v, idx) => (
                <tr key={v.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{v.item}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{v.location || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{v.pic || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${VENUE_STATUS_BADGE[v.status]}`}>{v.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{v.notes || "—"}</td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button onClick={() => startEdit(v)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    <button onClick={() => remove(v.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Transportation Tab ────────────────────────────────────────────────────────

function TransportTab({ vehicles, onChange }: { vehicles: VehicleItem[]; onChange: (v: VehicleItem[]) => void }) {
  const [form, setForm] = useState<Partial<VehicleItem>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  function startEdit(v: VehicleItem) { setEditingId(v.id); setForm({ ...v }); }
  function cancel() { setEditingId(null); setForm({}); }

  function save() {
    if (!form.vehicleType?.trim()) { toast.error("Vehicle type is required"); return; }
    if (editingId === "new") {
      onChange([...vehicles, { id: newId(), vehicleType: "", capacity: "", purpose: "", driver: "", pickupTime: "", status: "PENDING", ...form } as VehicleItem]);
    } else if (editingId) {
      onChange(vehicles.map(v => v.id === editingId ? { ...v, ...form } as VehicleItem : v));
    }
    cancel();
  }

  function remove(id: string) {
    if (!window.confirm("Remove this vehicle?")) return;
    onChange(vehicles.filter(v => v.id !== id));
  }

  function f(k: keyof VehicleItem) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Transportation</h3>
          {!editingId && (
            <Button size="sm" onClick={() => { setEditingId("new"); setForm({}); }} className="bg-cyan-600 hover:bg-cyan-700 text-xs">
              + Add Vehicle
            </Button>
          )}
        </div>

        {editingId && (
          <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input placeholder="Vehicle Type *" value={form.vehicleType ?? ""} onChange={f("vehicleType")} />
              <Input placeholder="Capacity" value={form.capacity ?? ""} onChange={f("capacity")} />
              <Input placeholder="Purpose" value={form.purpose ?? ""} onChange={f("purpose")} />
              <Input placeholder="Driver Name" value={form.driver ?? ""} onChange={f("driver")} />
              <Input placeholder="Pickup Time" value={form.pickupTime ?? ""} onChange={f("pickupTime")} />
              <Select value={form.status ?? "PENDING"} onValueChange={(v) => setForm(p => ({ ...p, status: v as VehicleItem["status"] }))}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ARRANGED">Arranged</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
              <Button size="sm" variant="outline" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        )}

        {vehicles.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No vehicles added yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Vehicle Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Capacity</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Purpose</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Driver</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Pickup Time</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, idx) => (
                <tr key={v.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{v.vehicleType}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{v.capacity || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{v.purpose || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{v.driver || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{v.pickupTime || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${VEHICLE_STATUS_BADGE[v.status]}`}>{v.status}</span>
                  </td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button onClick={() => startEdit(v)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    <button onClick={() => remove(v.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Equipment Tab ─────────────────────────────────────────────────────────────

function EquipmentTab({ equipment, onChange }: { equipment: EquipmentItem[]; onChange: (e: EquipmentItem[]) => void }) {
  const [form, setForm] = useState<Partial<EquipmentItem>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  function startEdit(e: EquipmentItem) { setEditingId(e.id); setForm({ ...e }); }
  function cancel() { setEditingId(null); setForm({}); }

  function save() {
    if (!form.item?.trim()) { toast.error("Item name is required"); return; }
    if (editingId === "new") {
      onChange([...equipment, { id: newId(), item: "", quantity: "", supplier: "", deliveryDate: "", collectedBy: "", status: "PENDING", ...form } as EquipmentItem]);
    } else if (editingId) {
      onChange(equipment.map(e => e.id === editingId ? { ...e, ...form } as EquipmentItem : e));
    }
    cancel();
  }

  function remove(id: string) {
    if (!window.confirm("Remove this item?")) return;
    onChange(equipment.filter(e => e.id !== id));
  }

  function f(k: keyof EquipmentItem) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Loading Bay & Equipment</h3>
          {!editingId && (
            <Button size="sm" onClick={() => { setEditingId("new"); setForm({}); }} className="bg-cyan-600 hover:bg-cyan-700 text-xs">
              + Add Item
            </Button>
          )}
        </div>

        {editingId && (
          <div className="p-4 bg-cyan-50/40 border-b border-cyan-100">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input placeholder="Item Name *" value={form.item ?? ""} onChange={f("item")} />
              <Input placeholder="Quantity" value={form.quantity ?? ""} onChange={f("quantity")} />
              <Input placeholder="Supplier" value={form.supplier ?? ""} onChange={f("supplier")} />
              <Input placeholder="Delivery Date" value={form.deliveryDate ?? ""} onChange={f("deliveryDate")} />
              <Input placeholder="Collected By" value={form.collectedBy ?? ""} onChange={f("collectedBy")} />
              <Select value={form.status ?? "PENDING"} onValueChange={(v) => setForm(p => ({ ...p, status: v as EquipmentItem["status"] }))}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="COLLECTED">Collected</SelectItem>
                  <SelectItem value="RETURNED">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
              <Button size="sm" variant="outline" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        )}

        {equipment.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No equipment items added yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Item</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Delivery Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Collected By</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {equipment.map((e, idx) => (
                <tr key={e.id} className={`border-b border-gray-50 ${idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{e.item}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{e.quantity || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{e.supplier || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{e.deliveryDate || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{e.collectedBy || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${EQUIPMENT_STATUS_BADGE[e.status]}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-2.5 flex gap-2">
                    <button onClick={() => startEdit(e)} className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    <button onClick={() => remove(e.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main Logistics Page ───────────────────────────────────────────────────────

export default function LogisticsPage() {
  const router = useRouter();
  const { allowed } = useDepartmentAccess("LOGISTICS");
  const { edition: rawEdition, isLoading } = useActiveEdition();
  const edition = rawEdition as { id: string; name: string; logisticsData?: unknown } | null;

  const [activeTab, setActiveTab]         = useState<LogisticsTab>("manpower");
  const [manpowerCount, setManpowerCount] = useState(0);
  const [saving, setSaving]               = useState(false);

  const [venues,    setVenues]    = useState<VenueItem[]>([]);
  const [vehicles,  setVehicles]  = useState<VehicleItem[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);

  // Load logisticsData from edition
  useEffect(() => {
    if (!edition) return;
    const raw = edition.logisticsData as LogisticsData | undefined;
    setVenues(raw?.venues    ?? []);
    setVehicles(raw?.vehicles  ?? []);
    setEquipment(raw?.equipment ?? []);
  }, [edition?.id]);

  const saveLogistics = useCallback(async (
    updatedVenues    = venues,
    updatedVehicles  = vehicles,
    updatedEquipment = equipment,
  ) => {
    if (!edition) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/annual-showcase/editions/${edition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logisticsData: { venues: updatedVenues, vehicles: updatedVehicles, equipment: updatedEquipment } }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [edition, venues, vehicles, equipment]);

  function handleVenueChange(v: VenueItem[]) {
    setVenues(v);
    saveLogistics(v, vehicles, equipment);
  }

  function handleVehicleChange(v: VehicleItem[]) {
    setVehicles(v);
    saveLogistics(venues, v, equipment);
  }

  function handleEquipmentChange(e: EquipmentItem[]) {
    setEquipment(e);
    saveLogistics(venues, vehicles, e);
  }

  if (!allowed) return null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="relative p-6 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <button
          onClick={() => router.push('/annual-showcase/editions')}
          className="absolute top-4 left-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Back to Editions
        </button>
        <span className="text-5xl">🚛</span>
        <h2 className="text-xl font-semibold text-gray-800">No edition selected</h2>
        <p className="text-sm text-gray-500 text-center max-w-sm">
          Select an active edition using the edition switcher in the header.
        </p>
      </div>
    );
  }

  const tabs = TABS.map(t =>
    t.id === "manpower" && manpowerCount > 0
      ? { ...t, label: `👥 Manpower (${manpowerCount})` }
      : t,
  );

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={() => router.push('/annual-showcase/editions')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Back to Editions
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">🚛</span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logistics</h1>
          <p className="text-sm text-gray-500">{edition.name}</p>
        </div>
        {saving && <span className="text-xs text-gray-400 ml-auto">Saving…</span>}
      </div>

      {/* Tabbed panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "text-cyan-700 border-b-2 border-cyan-600 bg-cyan-50/30"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {activeTab === "manpower" && (
            <ManpowerPanel editionId={edition.id} unit="LOGISTICS" onCountChange={setManpowerCount} />
          )}
          {activeTab === "venue" && (
            <VenueTab venues={venues} onChange={handleVenueChange} />
          )}
          {activeTab === "transport" && (
            <TransportTab vehicles={vehicles} onChange={handleVehicleChange} />
          )}
          {activeTab === "equipment" && (
            <EquipmentTab equipment={equipment} onChange={handleEquipmentChange} />
          )}
        </div>
      </div>
    </div>
  );
}
