"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/app/components/Sidebar";
import UserHeader from "@/app/components/UserHeader";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CustomSelect from "@/app/components/CustomSelect";
import { isEmployee as isEmployeeRole, isPartTime, isFullTime } from "@/lib/roles";

// --- HELPERS ---
const fmtHrs = (h: number): string => {
  if (h === 0) return "-";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
};

// --- BRANCHES BY REGION (for filters) ---
const REGIONS = [
  {
    value: "region-a", label: "Region A",
    branches: ["Rimbayu", "Klang", "Shah Alam", "Setia Alam", "Denai Alam", "Eco Grandeur", "Subang Taipan"],
  },
  {
    value: "region-b", label: "Region B",
    branches: ["Danau Kota", "Kota Damansara", "Ampang", "Sri Petaling", "Bandar Tun Hussein Onn", "Kajang TTDI Groove", "Taman Sri Gombak"],
  },
  {
    value: "region-c", label: "Region C",
    branches: ["Putrajaya", "Kota Warisan", "Bandar Baru Bangi", "Cyberjaya", "Bandar Seri Putra", "Dataran Puchong Utama", "Online"],
  },
];

// --- TYPES ---
interface StaffEntry {
  name: string;
  branch: string;
  employeeId: string | null;
  rate: number | null;
  employmentType: string | null;
  position: string | null;
  isPT: boolean;
  coachHrs: number;
  execHrs: number;
  totalHrs: number;
  classCount: number;
  coachPay: number;
  execPay: number;
  totalPay: number;
  days: { date: string; day: string; coachHrs: number; execHrs: number; totalHrs: number; classCount: number; scheduleBranch?: string }[];
}

interface Totals {
  totalStaff: number;
  ptCount: number;
  ftCount: number;
  totalCoachHrs: number;
  totalExecHrs: number;
  totalHrs: number;
  totalClasses: number;
  totalCoachPay: number;
  totalExecPay: number;
  totalPay: number;
  executiveRate: number;
}

interface WeekRange {
  start: string;
  end: string;
}

interface ApiResponse {
  success: boolean;
  month: string;
  totals: Totals;
  staff: StaffEntry[];
  availableWeeks?: WeekRange[];
}

// --- AVAILABLE MONTHS (generate last 6 months) ---
const getAvailableMonths = () => {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  const startMonth = new Date(2026, 3, 1); // April 2026 — first month with clean schedule data
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d >= startMonth; d.setMonth(d.getMonth() - 1)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    months.push({ value, label });
  }
  return months;
};

const AVAILABLE_MONTHS = getAvailableMonths();

// --- PAGE ---
type ViewTab = "all" | "pt" | "ft";

export default function ManpowerCostReportPage() {
  const { data: session } = useSession({ required: true });
  const userRole = (session?.user as any)?.role || "";
  const userName = (session?.user as any)?.name || "";
  // For employee accounts, User.branchName currently stores their name (matches Employee.name and ManpowerSchedule.selections values).
  const employeeName = (session?.user as any)?.branchName || "";
  const isEmployee = isEmployeeRole(userRole);
  const isEmployeePT = isPartTime(userRole);
  const isEmployeeFT = isFullTime(userRole);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(AVAILABLE_MONTHS[0].value);
  const [regionFilter, setRegionFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [weekFilter, setWeekFilter] = useState<string>(""); // "" = full month, "start:::end" = specific week
  const [viewTab, setViewTab] = useState<ViewTab>("all");
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const selectedRegion = REGIONS.find((r) => r.value === regionFilter);
  const branchOptions = selectedRegion ? selectedRegion.branches : [];

  const handleRegionChange = (value: string) => {
    setRegionFilter(value);
    setBranchFilter("");
  };

  // --- PDF EXPORT ---
  const generatePDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Load logo through an Image + canvas so jsPDF gets a freshly re-encoded
    // PNG. Going blob → readAsDataURL directly handed jsPDF bytes it rejected
    // with "Incomplete or corrupt PNG file" — likely an interaction with the
    // dev server's PNG response. The canvas round-trip normalizes the image.
    //
    // Notably we do NOT set img.crossOrigin: this is a same-origin asset, and
    // setting crossOrigin="anonymous" causes Next's dev server (which doesn't
    // always emit Access-Control-Allow-Origin for /public files) to block the
    // load with a CORS error, leaving the PDF logo-less.
    let logoImg: string | null = null;
    try {
      logoImg = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("no 2d context"));
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error("logo load failed"));
        img.src = "/ebright-logo.png";
      });
    } catch (err) {
      console.warn("PDF logo could not be loaded; generating without it", err);
      logoImg = null;
    }

    // Header bar
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageW, 28, "F");

    let headerX = 14;
    if (logoImg) {
      // Defensive: even after validation, jsPDF can still reject the buffer
      // (e.g. interlaced PNGs in older jsPDF versions). Don't kill the whole
      // PDF over a logo — fall back to a text-only header.
      try {
        doc.addImage(logoImg, "PNG", 14, 3, 55, 22);
        headerX = 74;
      } catch (e) {
        console.warn("PDF logo render failed, continuing without logo", e);
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("MANPOWER COST REPORT", headerX, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const periodLabel = weekFilter
      ? `Week: ${weekStart} to ${weekEnd}`
      : `Period: ${monthLabel}`;
    const filterLabels = [periodLabel];
    if (regionFilter) filterLabels.push(`Region: ${REGIONS.find(r => r.value === regionFilter)?.label || regionFilter}`);
    if (branchFilter) filterLabels.push(`Branch: ${branchFilter}`);
    if (viewTab !== "all") filterLabels.push(`Type: ${viewTab.toUpperCase()}`);
    doc.text(filterLabels.join("  |  "), headerX, 21);

    // Generated date on right
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-MY")}`, pageW - 14, 21, { align: "right" });

    let y = 36;

    if (isEmployee && filteredStaff.length > 0) {
      // --- EMPLOYEE PDF: profile info + daily breakdown ---
      const s = filteredStaff[0];
      const eRate = data?.totals.executiveRate || 11;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(s.name, 14, y);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      y += 5;
      const infoLine = [s.branch, isEmployeePT ? "Part-Time" : "Full-Time"];
      if (isEmployeePT && s.rate) infoLine.push(`Coach: RM${s.rate}/hr`, `Exec: RM${eRate}/hr`);
      doc.text(infoLine.join("  |  "), 14, y);
      y += 5;
      y += 4;

      // Build daily table
      const [pyr, pmn] = selectedMonth.split("-").map(Number);
      const dow = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const numD = new Date(pyr, pmn, 0).getDate();
      const allD = Array.from({ length: numD }, (_, i) => {
        const d = i + 1;
        const ds = `${pyr}-${String(pmn).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        return { dayNum: d, date: ds, day: dow[new Date(pyr, pmn-1, d).getDay()] };
      });
      const showDays = weekFilter ? allD.filter((d) => d.date >= weekStart && d.date <= weekEnd) : allD;
      const wMap: Record<string, any> = {};
      s.days.forEach((d) => { wMap[d.date] = d; });

      const dHead = isEmployeePT
        ? [["No.", "Day", "Date", "Coach Hr", "Class", "Rate", "Total", "Exec Hr", "Rate", "Total", "Total Hr", "Total Pay"]]
        : [["No.", "Day", "Date", "Coach Hr", "Class", "Exec Hr", "Total Hr"]];

      const dBody = showDays.map((row) => {
        const e = wMap[row.date];
        const worked = !!e;
        const cls = worked ? (e.classCount ?? 0) : 0;
        if (isEmployeePT) {
          const cp = worked ? e.coachHrs * (s.rate || 0) : 0;
          const ep = worked ? e.execHrs * eRate : 0;
          return [
            String(row.dayNum), row.day.slice(0,3), row.date,
            worked ? fmtHrs(e.coachHrs) : "-",
            worked && cls > 0 ? String(cls) : "-",
            worked && e.coachHrs > 0 ? `RM${s.rate}` : "-", worked && cp > 0 ? `RM ${cp.toFixed(2)}` : "-",
            worked ? fmtHrs(e.execHrs) : "-", worked && e.execHrs > 0 ? `RM${eRate}` : "-", worked && ep > 0 ? `RM ${ep.toFixed(2)}` : "-",
            worked ? fmtHrs(e.totalHrs) : "-",
            worked ? `RM ${(cp + ep).toFixed(2)}` : "-",
          ];
        }
        return [
          String(row.dayNum), row.day.slice(0,3), row.date,
          worked ? fmtHrs(e.coachHrs) : "-",
          worked && cls > 0 ? String(cls) : "-",
          worked ? fmtHrs(e.execHrs) : "-", worked ? fmtHrs(e.totalHrs) : "-",
        ];
      });

      // Footer
      const totalClasses = s.classCount ?? 0;
      const dFooter = isEmployeePT
        ? ["Total", "", `${s.days.length} days`, fmtHrs(s.coachHrs), String(totalClasses), "", `RM ${s.coachPay.toFixed(2)}`, fmtHrs(s.execHrs), "", `RM ${s.execPay.toFixed(2)}`, fmtHrs(s.totalHrs), `RM ${s.totalPay.toFixed(2)}`]
        : ["Total", "", `${s.days.length} days`, fmtHrs(s.coachHrs), String(totalClasses), fmtHrs(s.execHrs), fmtHrs(s.totalHrs)];
      dBody.push(dFooter);

      autoTable(doc, {
        startY: y, head: dHead, body: dBody, theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (hookData: any) => {
          if (hookData.section === "body" && hookData.row.index === dBody.length - 1) {
            hookData.cell.styles.fillColor = [30, 41, 59];
            hookData.cell.styles.textColor = 255;
            hookData.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: 14, right: 14 },
      });
    } else {
      // --- FINANCE PDF: summary + staff table ---
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("SUMMARY", 14, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const summaryLines = [
        `Staff: ${filteredTotals.totalStaff} (PT: ${filteredTotals.ptCount} | FT: ${filteredTotals.ftCount})`,
        `Total Hours: ${fmtHrs(filteredTotals.totalHrs)}    Coach Hours: ${fmtHrs(filteredTotals.totalCoachHrs)}    Exec Hours: ${fmtHrs(filteredTotals.totalExecHrs)}`,
        `PT Cost: RM ${filteredTotals.totalPay.toFixed(2)}    Avg/PT: RM ${filteredTotals.ptCount > 0 ? (filteredTotals.totalPay / filteredTotals.ptCount).toFixed(2) : "0.00"}`,
      ];
      summaryLines.forEach((line) => {
        doc.text(line, 14, y);
        y += 5;
      });
      y += 4;

      const tableHead = viewTab === "ft"
        ? [["Name", "Branch", "Type", "Coach Hrs", "Class", "Exec Hrs", "Total Hrs"]]
        : [["Name", "Branch", "Type", "Coach Hrs", "Class", "Exec Hrs", "Total Hrs", "Rate", "Total Pay"]];

      const tableBody = filteredStaff.map((s) => {
        const row = [s.name, s.branch, s.isPT ? "PT" : "FT", fmtHrs(s.coachHrs), String(s.classCount ?? 0), fmtHrs(s.execHrs), fmtHrs(s.totalHrs)];
        if (viewTab !== "ft") { row.push(s.isPT && s.rate ? `RM${s.rate}` : "-"); row.push(s.isPT ? `RM ${s.totalPay.toFixed(2)}` : "-"); }
        return row;
      });

      const footerRow = [`Total (${filteredTotals.totalStaff})`, "", "", fmtHrs(filteredTotals.totalCoachHrs), String(filteredTotals.totalClasses ?? 0), fmtHrs(filteredTotals.totalExecHrs), fmtHrs(filteredTotals.totalHrs)];
      if (viewTab !== "ft") { footerRow.push(""); footerRow.push(`RM ${filteredTotals.totalPay.toFixed(2)}`); }
      tableBody.push(footerRow);

      autoTable(doc, {
        startY: y, head: tableHead, body: tableBody, theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (hookData: any) => {
          if (hookData.section === "body" && hookData.row.index === tableBody.length - 1) {
            hookData.cell.styles.fillColor = [30, 41, 59];
            hookData.cell.styles.textColor = 255;
            hookData.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: 14, right: 14 },
      });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text("Ebright HRMS — Confidential", 14, pageH - 6);
      doc.text(`Page ${i} of ${totalPages}`, pageW - 14, pageH - 6, { align: "right" });
    }

    // Open PDF in new tab for preview (user can download from there)
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, "_blank");
  };

  const hasActiveFilters = regionFilter !== "" || branchFilter !== "" || searchQuery !== "" || viewTab !== "all" || weekFilter !== "";
  const clearFilters = () => {
    setRegionFilter("");
    setBranchFilter("");
    setSearchQuery("");
    setWeekFilter("");
    setViewTab("all");
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWeekFilter("");
    try {
      const res = await fetch(`/api/manpower-cost?month=${selectedMonth}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      setError("Failed to load manpower cost data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Parse week filter dates
  const weekStart = weekFilter ? weekFilter.split(":::")[0] : "";
  const weekEnd = weekFilter ? weekFilter.split(":::")[1] : "";

  // Filter staff by search, region/branch, view tab, and week
  // When week filter is active, recalculate hours from only the days in that week
  const filteredStaff = (data?.staff || [])
    .map((s) => {
      if (!weekFilter) return s;
      // Filter days to only those within the selected week
      const weekDays = s.days.filter((d) => d.date >= weekStart && d.date <= weekEnd);
      if (weekDays.length === 0) return null;
      const coachHrs = weekDays.reduce((sum, d) => sum + d.coachHrs, 0);
      const execHrs = weekDays.reduce((sum, d) => sum + d.execHrs, 0);
      const classCount = weekDays.reduce((sum, d) => sum + (d.classCount || 0), 0);
      const totalHrs = coachHrs + execHrs;
      const coachPay = s.isPT && s.rate ? coachHrs * s.rate : 0;
      const execPay = s.isPT ? execHrs * (data?.totals.executiveRate || 11) : 0;
      return { ...s, days: weekDays, coachHrs, execHrs, totalHrs, classCount, coachPay, execPay, totalPay: coachPay + execPay };
    })
    .filter((s): s is StaffEntry => {
      if (!s) return false;
      // Employee self-view filtering happens server-side (in /api/manpower-cost),
      // which resolves the logged-in user to a BranchStaff record by email and
      // returns only their row. No client-side name match is needed — and one
      // here would actually break, because the server returns the BranchStaff
      // full name while session.branchName is usually a short form.
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.branch.toLowerCase().includes(q)) return false;
      }
      if (branchFilter && s.branch !== branchFilter) return false;
      if (regionFilter && !branchFilter) {
        const region = REGIONS.find((r) => r.value === regionFilter);
        if (region && !region.branches.includes(s.branch)) return false;
      }
      if (viewTab === "pt" && !s.isPT) return false;
      if (viewTab === "ft" && s.isPT) return false;
      return true;
    });

  // Recalculate totals for filtered view
  const filteredTotals = {
    totalStaff: filteredStaff.length,
    ptCount: filteredStaff.filter((s) => s.isPT).length,
    ftCount: filteredStaff.filter((s) => !s.isPT).length,
    totalCoachHrs: filteredStaff.reduce((s, r) => s + r.coachHrs, 0),
    totalExecHrs: filteredStaff.reduce((s, r) => s + r.execHrs, 0),
    totalHrs: filteredStaff.reduce((s, r) => s + r.totalHrs, 0),
    totalClasses: filteredStaff.reduce((s, r) => s + (r.classCount || 0), 0),
    totalCoachPay: filteredStaff.filter((s) => s.isPT).reduce((s, r) => s + r.coachPay, 0),
    totalExecPay: filteredStaff.filter((s) => s.isPT).reduce((s, r) => s + r.execPay, 0),
    totalPay: filteredStaff.filter((s) => s.isPT).reduce((s, r) => s + r.totalPay, 0),
  };

  const monthLabel = AVAILABLE_MONTHS.find((m) => m.value === selectedMonth)?.label || selectedMonth;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-slate-900 text-white shrink-0 relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
        <div className="relative flex justify-between items-center px-10 py-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboards/hrms" className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-black tracking-tight uppercase">
                {isEmployee ? <>My <span className="text-green-400">Manpower Report</span></> : <>Manpower <span className="text-green-400">Cost Report</span></>}
              </h1>
              <p className="text-slate-400 font-medium text-sm tracking-widest mt-0.5">EBRIGHT HRMS</p>
            </div>
          </div>
          <UserHeader
            userName={(isEmployee ? employeeName : userName) || userName || session?.user?.email?.split("@")[0] || "User"}
            userEmail={session?.user?.email || ""}
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((p) => !p)} />

        <main className="flex-1 overflow-y-auto px-8 py-8 bg-[#F8FAFC]">
          <div className="mx-auto w-full max-w-7xl animate-in fade-in duration-500">

            {/* Toolbar (finance view only) */}
            {!isEmployee && (
              <div className="flex flex-wrap items-center gap-3 mb-6">
                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name..."
                    className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all w-[160px]"
                  />
                </div>

                <CustomSelect
                  value={viewTab}
                  onChange={(v) => setViewTab(v as ViewTab)}
                  options={[
                    { value: "all", label: "All Staff" },
                    { value: "pt", label: "Part-Time" },
                    { value: "ft", label: "Full-Time" },
                  ]}
                />

                <CustomSelect
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  options={AVAILABLE_MONTHS.map((m) => ({ value: m.value, label: m.label }))}
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                />

                {!loading && data?.availableWeeks && data.availableWeeks.length > 0 && (
                  <CustomSelect
                    value={weekFilter}
                    onChange={setWeekFilter}
                    options={[
                      { value: "", label: "Full Month" },
                      ...data.availableWeeks.map((w, i) => {
                        const startDateObj = new Date(w.start + "T00:00:00");
                        const endDateObj = new Date(w.end + "T00:00:00");
                        const sd = startDateObj.getDate();
                        const ed = endDateObj.getDate();
                        const sm = startDateObj.toLocaleString("en-US", { month: "short" });
                        const em = endDateObj.toLocaleString("en-US", { month: "short" });
                        // Cross-month weeks (e.g. Apr 30 – May 5) must show both
                        // months so the user can tell which week they're picking.
                        const label = sm === em
                          ? `Wk${i + 1} (${sd}-${ed} ${sm})`
                          : `Wk${i + 1} (${sd} ${sm} - ${ed} ${em})`;
                        return { value: `${w.start}:::${w.end}`, label };
                      }),
                    ]}
                    placeholder="Week"
                    icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                  />
                )}

                <CustomSelect
                  value={regionFilter}
                  onChange={handleRegionChange}
                  options={[
                    { value: "", label: "All Regions" },
                    ...REGIONS.map((r) => ({ value: r.value, label: r.label })),
                  ]}
                />

                {regionFilter && branchOptions.length > 0 && (
                  <CustomSelect
                    value={branchFilter}
                    onChange={setBranchFilter}
                    options={[
                      { value: "", label: "All Branches" },
                      ...branchOptions.map((b) => ({ value: b, label: b })),
                    ]}
                  />
                )}

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Loading / Error */}
            {loading && (
              <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-500 font-medium">Loading manpower cost data...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                <p className="text-red-600 font-medium">{error}</p>
                <button onClick={fetchData} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700">
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && data && isEmployee && (() => {
              const s = filteredStaff[0];
              if (!s) return (
                <>
                  {/* Month/Week selector available even when there's no data, so the employee can switch to a month with data */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <h2 className="text-xl font-black text-slate-800">{employeeName || userName || "Employee"}</h2>
                        <p className="text-sm text-slate-500 mt-1">
                          {isEmployeePT ? "Part-Time" : isEmployeeFT ? "Full-Time" : ""} — Select a month to view your manpower report.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CustomSelect
                          value={selectedMonth}
                          onChange={setSelectedMonth}
                          options={AVAILABLE_MONTHS.map((m) => ({ value: m.value, label: m.label }))}
                          icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <p className="text-slate-400 font-medium">No data found for {monthLabel}.</p>
                    <p className="text-slate-300 text-sm mt-1">Make sure schedules are finalized for this month, or select a different month above.</p>
                  </div>
                </>
              );

              const execRate = data.totals.executiveRate || 11;
              const [yr, mn] = selectedMonth.split("-").map(Number);
              const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
              const numDays = new Date(yr, mn, 0).getDate();
              const allDaysRaw = Array.from({ length: numDays }, (_, i) => {
                const d = i + 1;
                const dateStr = `${yr}-${String(mn).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const dayName = daysOfWeek[new Date(yr, mn - 1, d).getDay()];
                return { dayNum: d, date: dateStr, day: dayName };
              });
              // Filter to selected week if active
              const displayDays = weekFilter
                ? allDaysRaw.filter((d) => d.date >= weekStart && d.date <= weekEnd)
                : allDaysRaw;
              const workedMap: Record<string, { coachHrs: number; execHrs: number; totalHrs: number; classCount: number; scheduleBranch?: string }> = {};
              s.days.forEach((d) => { workedMap[d.date] = d; });

              return (
                <>
                  {/* Employee Profile Card + Month Selector */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-lg font-black text-white shrink-0">
                        {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black text-slate-800">{s.name}</h2>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-sm text-slate-500 font-medium">{s.branch}</span>
                          <span className="text-slate-300">|</span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isEmployeePT
                              ? "bg-purple-100 text-purple-700 border border-purple-200"
                              : "bg-blue-100 text-blue-700 border border-blue-200"
                          }`}>
                            {isEmployeePT ? "Part-Time" : "Full-Time"}
                          </span>
                          {isEmployeePT && s.rate && (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="text-sm font-bold text-orange-600">Coach Rate: RM {s.rate}/hr</span>
                              <span className="text-slate-300">|</span>
                              <span className="text-sm font-bold text-indigo-600">Exec Rate: RM {execRate}/hr</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CustomSelect
                          value={selectedMonth}
                          onChange={setSelectedMonth}
                          options={AVAILABLE_MONTHS.map((m) => ({ value: m.value, label: m.label }))}
                          icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                        />
                        {data?.availableWeeks && data.availableWeeks.length > 0 && (
                          <CustomSelect
                            value={weekFilter}
                            onChange={setWeekFilter}
                            options={[
                              { value: "", label: "Full Month" },
                              ...data.availableWeeks.map((w, i) => {
                                const sd = new Date(w.start + "T00:00:00").getDate();
                                const ed = new Date(w.end + "T00:00:00").getDate();
                                const mn = new Date(w.start + "T00:00:00").toLocaleString("en-US", { month: "short" });
                                return { value: `${w.start}:::${w.end}`, label: `Wk${i + 1} (${sd}-${ed} ${mn})` };
                              }),
                            ]}
                            placeholder="Week"
                            icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                          />
                        )}
                        <button
                          onClick={() => generatePDF()}
                          className="px-3 py-2.5 bg-red-600 border border-red-600 text-white rounded-xl hover:bg-red-700 transition-all"
                          title="Download PDF"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className={`grid grid-cols-2 ${isEmployeePT ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4 mb-6`}>
                    <div className="rounded-2xl p-4 bg-white border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Hours</p>
                      <p className="text-xl font-black text-blue-600">{fmtHrs(s.totalHrs)}</p>
                    </div>
                    <div className="rounded-2xl p-4 bg-orange-50 border border-orange-200">
                      <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-1">Coach Hours</p>
                      <p className="text-xl font-black text-orange-600">{fmtHrs(s.coachHrs)}</p>
                    </div>
                    <div className="rounded-2xl p-4 bg-indigo-50 border border-indigo-200">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Exec Hours</p>
                      <p className="text-xl font-black text-indigo-600">{fmtHrs(s.execHrs)}</p>
                    </div>
                    {isEmployeePT && (
                      <div className="rounded-2xl p-4 bg-green-50 border border-green-200">
                        <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">Total Pay</p>
                        <p className="text-xl font-black text-green-600">RM {s.totalPay.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>

                  {/* Daily Breakdown Table (shown directly, no expand).
                      The inner div is the scroll container (max-h + overflow),
                      so sticky-thead is anchored here and definitely works
                      regardless of whether <main> or the body is scrolling. */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-200">
                      <p className="text-sm font-bold text-slate-700">
                        Daily Breakdown — <span className="text-blue-600">{weekFilter ? `${weekStart} to ${weekEnd}` : monthLabel}</span>
                      </p>
                      <p className="text-xs text-slate-500 font-medium">{s.days.length} day{s.days.length !== 1 ? "s" : ""} worked</p>
                    </div>
                    <div className="max-h-[70vh] overflow-auto">
                      <table className="w-full text-left">
                        <thead className="sticky-thead">
                          {isEmployeePT ? (
                            <tr className="text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                              <th className="px-3 py-3 text-slate-400 w-10 bg-slate-50">No.</th>
                              <th className="px-3 py-3 text-slate-400 bg-slate-50">Day</th>
                              <th className="px-3 py-3 text-slate-400 bg-slate-50">Date</th>
                              <th className="px-3 py-3 text-orange-400 text-center bg-slate-50">Coach Hr</th>
                              <th className="px-3 py-3 text-pink-400 text-center bg-slate-50">Class</th>
                              <th className="px-3 py-3 text-orange-400 text-center bg-slate-50">Rate</th>
                              <th className="px-3 py-3 text-orange-500 text-center bg-slate-50">Total</th>
                              <th className="px-3 py-3 text-indigo-400 text-center bg-slate-50">Exec Hr</th>
                              <th className="px-3 py-3 text-indigo-400 text-center bg-slate-50">Rate</th>
                              <th className="px-3 py-3 text-indigo-500 text-center bg-slate-50">Total</th>
                              <th className="px-3 py-3 text-blue-400 text-center bg-slate-50">Total Hr</th>
                              <th className="px-3 py-3 text-green-600 text-right bg-slate-50">Total Pay</th>
                            </tr>
                          ) : (
                            <tr className="text-xs font-bold uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                              <th className="px-4 py-3 text-slate-400 w-12 bg-slate-50">No.</th>
                              <th className="px-4 py-3 text-slate-400 bg-slate-50">Day</th>
                              <th className="px-4 py-3 text-slate-400 bg-slate-50">Date</th>
                              <th className="px-4 py-3 text-orange-400 text-center bg-slate-50">Coach Hr</th>
                              <th className="px-4 py-3 text-pink-400 text-center bg-slate-50">Class</th>
                              <th className="px-4 py-3 text-indigo-400 text-center bg-slate-50">Exec Hr</th>
                              <th className="px-4 py-3 text-blue-400 text-center bg-slate-50">Total Hr</th>
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayDays.map((row) => {
                            const entry = workedMap[row.date];
                            const isWeekend = row.day === "Saturday" || row.day === "Sunday";
                            const worked = !!entry;
                            const coachPayDay = worked ? entry.coachHrs * (s.rate || 0) : 0;
                            const execPayDay = worked ? entry.execHrs * execRate : 0;
                            const dayPay = coachPayDay + execPayDay;

                            const isReplacement = worked && entry.scheduleBranch;

                            return isEmployeePT ? (
                              <tr key={row.date} className={`transition-colors ${
                                !worked ? "bg-slate-50/50 text-slate-300" :
                                isReplacement ? "bg-amber-50/50 hover:bg-amber-50/80" :
                                isWeekend ? "bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-slate-50/50"
                              }`}>
                                <td className="px-3 py-2 text-xs font-medium text-slate-400">{row.dayNum}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-xs font-bold ${!worked ? "text-slate-300" : isWeekend ? "text-blue-600" : "text-slate-600"}`}>
                                    {row.day.slice(0, 3)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-500">
                                  {row.date}
                                  {isReplacement && (
                                    <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">@ {entry.scheduleBranch}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold">
                                  <span className={worked ? "text-orange-600" : "text-slate-300"}>{worked ? fmtHrs(entry.coachHrs) : "-"}</span>
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold">
                                  <span className={worked && (entry.classCount ?? 0) > 0 ? "text-pink-600" : "text-slate-300"}>{worked && (entry.classCount ?? 0) > 0 ? entry.classCount : "-"}</span>
                                </td>
                                <td className="px-3 py-2 text-center text-xs text-slate-400">
                                  {worked && entry.coachHrs > 0 ? `RM${s.rate}` : "-"}
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold">
                                  <span className={worked && coachPayDay > 0 ? "text-orange-700" : "text-slate-300"}>{worked && coachPayDay > 0 ? `RM ${coachPayDay.toFixed(2)}` : "-"}</span>
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold">
                                  <span className={worked ? "text-indigo-600" : "text-slate-300"}>{worked ? fmtHrs(entry.execHrs) : "-"}</span>
                                </td>
                                <td className="px-3 py-2 text-center text-xs text-slate-400">
                                  {worked && entry.execHrs > 0 ? `RM${execRate}` : "-"}
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-bold">
                                  <span className={worked && execPayDay > 0 ? "text-indigo-700" : "text-slate-300"}>{worked && execPayDay > 0 ? `RM ${execPayDay.toFixed(2)}` : "-"}</span>
                                </td>
                                <td className="px-3 py-2 text-center text-xs font-black">
                                  <span className={worked ? "text-blue-600" : "text-slate-300"}>{worked ? fmtHrs(entry.totalHrs) : "-"}</span>
                                </td>
                                <td className="px-3 py-2 text-right text-xs font-black">
                                  <span className={worked ? "text-green-600" : "text-slate-300"}>{worked ? `RM ${dayPay.toFixed(2)}` : "-"}</span>
                                </td>
                              </tr>
                            ) : (
                              <tr key={row.date} className={`transition-colors ${
                                !worked ? "bg-slate-50/50 text-slate-300" :
                                isReplacement ? "bg-amber-50/50 hover:bg-amber-50/80" :
                                isWeekend ? "bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-slate-50/50"
                              }`}>
                                <td className="px-4 py-2 text-xs font-medium text-slate-400">{row.dayNum}</td>
                                <td className="px-4 py-2">
                                  <span className={`text-xs font-bold ${!worked ? "text-slate-300" : isWeekend ? "text-blue-600" : "text-slate-600"}`}>
                                    {row.day.slice(0, 3)}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-xs text-slate-500">
                                  {row.date}
                                  {isReplacement && (
                                    <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">@ {entry.scheduleBranch}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center text-xs font-bold">
                                  <span className={worked ? "text-orange-600" : "text-slate-300"}>{worked ? fmtHrs(entry.coachHrs) : "-"}</span>
                                </td>
                                <td className="px-4 py-2 text-center text-xs font-bold">
                                  <span className={worked && (entry.classCount ?? 0) > 0 ? "text-pink-600" : "text-slate-300"}>{worked && (entry.classCount ?? 0) > 0 ? entry.classCount : "-"}</span>
                                </td>
                                <td className="px-4 py-2 text-center text-xs font-bold">
                                  <span className={worked ? "text-indigo-600" : "text-slate-300"}>{worked ? fmtHrs(entry.execHrs) : "-"}</span>
                                </td>
                                <td className="px-4 py-2 text-center text-xs font-black">
                                  <span className={worked ? "text-blue-600" : "text-slate-300"}>{worked ? fmtHrs(entry.totalHrs) : "-"}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          {isEmployeePT ? (
                            <tr className="bg-slate-900 text-white">
                              <td colSpan={3} className="px-3 py-3 text-xs font-black uppercase">Total ({s.days.length} days)</td>
                              <td className="px-3 py-3 text-center text-xs font-black text-orange-300">{fmtHrs(s.coachHrs)}</td>
                              <td className="px-3 py-3 text-center text-xs font-black text-pink-300">{s.classCount ?? 0}</td>
                              <td className="px-3 py-3"></td>
                              <td className="px-3 py-3 text-center text-xs font-black text-orange-300">RM {s.coachPay.toFixed(2)}</td>
                              <td className="px-3 py-3 text-center text-xs font-black text-indigo-300">{fmtHrs(s.execHrs)}</td>
                              <td className="px-3 py-3"></td>
                              <td className="px-3 py-3 text-center text-xs font-black text-indigo-300">RM {s.execPay.toFixed(2)}</td>
                              <td className="px-3 py-3 text-center text-xs font-black text-blue-300">{fmtHrs(s.totalHrs)}</td>
                              <td className="px-3 py-3 text-right text-sm font-black text-green-400">RM {s.totalPay.toFixed(2)}</td>
                            </tr>
                          ) : (
                            <tr className="bg-slate-900 text-white">
                              <td colSpan={3} className="px-4 py-3 text-xs font-black uppercase">Monthly Total ({s.days.length} days worked)</td>
                              <td className="px-4 py-3 text-center text-xs font-black text-orange-300">{fmtHrs(s.coachHrs)}</td>
                              <td className="px-4 py-3 text-center text-xs font-black text-pink-300">{s.classCount ?? 0}</td>
                              <td className="px-4 py-3 text-center text-xs font-black text-indigo-300">{fmtHrs(s.execHrs)}</td>
                              <td className="px-4 py-3 text-center text-xs font-black text-blue-300">{fmtHrs(s.totalHrs)}</td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}

            {!loading && !error && data && !isEmployee && (
              <>
                {/* Finance view: full summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                  <div className="rounded-2xl p-4 bg-white border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Staff</p>
                    <p className="text-2xl font-black text-slate-700">{filteredTotals.totalStaff}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">PT: {filteredTotals.ptCount} | FT: {filteredTotals.ftCount}</p>
                  </div>
                  <div className="rounded-2xl p-4 bg-white border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Hours</p>
                    <p className="text-xl font-black text-blue-600">{fmtHrs(filteredTotals.totalHrs)}</p>
                  </div>
                  <div className="rounded-2xl p-4 bg-orange-50 border border-orange-200">
                    <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-1">Coach Hours</p>
                    <p className="text-xl font-black text-orange-600">{fmtHrs(filteredTotals.totalCoachHrs)}</p>
                  </div>
                  <div className="rounded-2xl p-4 bg-indigo-50 border border-indigo-200">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Exec Hours</p>
                    <p className="text-xl font-black text-indigo-600">{fmtHrs(filteredTotals.totalExecHrs)}</p>
                  </div>
                  <div className="rounded-2xl p-4 bg-green-50 border border-green-200">
                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">PT Cost</p>
                    <p className="text-xl font-black text-green-600">RM {filteredTotals.totalPay.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="rounded-2xl p-4 bg-white border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avg / PT</p>
                    <p className="text-xl font-black text-slate-600">
                      RM {filteredTotals.ptCount > 0 ? (filteredTotals.totalPay / filteredTotals.ptCount).toFixed(0) : "0"}
                    </p>
                  </div>
                </div>

                {/* Rate Info + PDF Download */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 mb-6 flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-slate-500">
                    <span className="font-bold text-slate-700">Exec Rate:</span> RM {data.totals.executiveRate}/hr (fixed)
                    <span className="mx-3 text-slate-300">|</span>
                    <span className="font-bold text-slate-700">Coach Rate:</span> per employee profile (PT only)
                    <span className="mx-3 text-slate-300">|</span>
                    <span className="font-bold text-slate-700">Period:</span> {weekFilter ? `${weekStart} to ${weekEnd}` : monthLabel}
                    <span className="mx-3 text-slate-300">|</span>
                    <span className="font-bold text-slate-700">FT:</span> hours only (fixed salary)
                  </p>
                  <button
                    onClick={() => generatePDF()}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PDF
                  </button>
                </div>

                {/* Staff Table — the inner div is the scroll container
                    (max-h + overflow), which guarantees sticky-thead actually
                    sticks regardless of whether the outer page or <main>
                    scrolls. */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="max-h-[70vh] overflow-auto">
                    <table className="w-full text-left">
                      <thead className="sticky-thead">
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Name</th>
                          <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Branch</th>
                          <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center bg-slate-50">Type</th>
                          <th className="px-5 py-4 text-xs font-bold text-orange-500 uppercase tracking-wider text-center bg-slate-50">Coach Hrs</th>
                          <th className="px-5 py-4 text-xs font-bold text-pink-500 uppercase tracking-wider text-center bg-slate-50">Class</th>
                          <th className="px-5 py-4 text-xs font-bold text-indigo-500 uppercase tracking-wider text-center bg-slate-50">Exec Hrs</th>
                          <th className="px-5 py-4 text-xs font-bold text-blue-500 uppercase tracking-wider text-center bg-slate-50">Total Hrs</th>
                          {viewTab !== "ft" && (
                            <>
                              <th className="px-5 py-4 text-xs font-bold text-orange-500 uppercase tracking-wider text-center bg-slate-50">Rate</th>
                              <th className="px-5 py-4 text-xs font-bold text-green-600 uppercase tracking-wider text-right bg-slate-50">Total Pay</th>
                            </>
                          )}
                          <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-12 bg-slate-50"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStaff.length === 0 ? (
                          <tr>
                            <td colSpan={99} className="px-5 py-12 text-center">
                              <p className="text-slate-400 font-medium">No staff data found for {monthLabel}.</p>
                              <p className="text-slate-300 text-sm mt-1">Make sure schedules are finalized for this month.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredStaff.map((s) => {
                            const isExpanded = expandedCoach === `${s.name}:::${s.branch}`;
                            return (
                              <React.Fragment key={`${s.name}:::${s.branch}`}>
                                <tr className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? "bg-blue-50/30" : ""}`}>
                                  <td className="px-5 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                        {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-slate-800">{s.name}</p>
                                        <p className="text-[10px] text-slate-400">{s.employeeId || "-"}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 text-sm text-slate-600 font-medium">{s.branch}</td>
                                  <td className="px-5 py-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                      s.isPT
                                        ? "bg-purple-100 text-purple-700 border border-purple-200"
                                        : "bg-blue-100 text-blue-700 border border-blue-200"
                                    }`}>
                                      {s.isPT ? "PT" : "FT"}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 text-center text-sm font-bold text-orange-600">{fmtHrs(s.coachHrs)}</td>
                                  <td className="px-5 py-4 text-center text-sm font-bold text-pink-600">{s.classCount ?? 0}</td>
                                  <td className="px-5 py-4 text-center text-sm font-bold text-indigo-600">{fmtHrs(s.execHrs)}</td>
                                  <td className="px-5 py-4 text-center text-sm font-black text-blue-600">{fmtHrs(s.totalHrs)}</td>
                                  {viewTab !== "ft" && (
                                    <>
                                      <td className="px-5 py-4 text-center text-sm text-slate-500">
                                        {s.isPT && s.rate ? `RM${s.rate}` : "-"}
                                      </td>
                                      <td className="px-5 py-4 text-right text-sm font-black text-green-600">
                                        {s.isPT ? `RM ${s.totalPay.toFixed(2)}` : "-"}
                                      </td>
                                    </>
                                  )}
                                  <td className="px-5 py-4 text-center">
                                    {s.days.length > 0 && (
                                      <button
                                        onClick={() => setExpandedCoach(isExpanded ? null : `${s.name}:::${s.branch}`)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                                      >
                                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    )}
                                  </td>
                                </tr>

                                {/* Inline daily breakdown */}
                                {isExpanded && (() => {
                                  const [yr, mn] = selectedMonth.split("-").map(Number);
                                  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                                  const numDays = new Date(yr, mn, 0).getDate();
                                  const allDaysRaw = Array.from({ length: numDays }, (_, i) => {
                                    const d = i + 1;
                                    const dateStr = `${yr}-${String(mn).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                                    const dayName = daysOfWeek[new Date(yr, mn - 1, d).getDay()];
                                    return { dayNum: d, date: dateStr, day: dayName };
                                  });
                                  const allDaysInMonth = weekFilter
                                    ? allDaysRaw.filter((d) => d.date >= weekStart && d.date <= weekEnd)
                                    : allDaysRaw;
                                  const workedMap: Record<string, { coachHrs: number; execHrs: number; totalHrs: number; classCount: number; scheduleBranch?: string }> = {};
                                  s.days.forEach((d) => { workedMap[d.date] = d; });
                                  const execRate = data?.totals.executiveRate || 10;

                                  return (
                                    <tr>
                                      <td colSpan={99} className="p-0">
                                        <div className="bg-slate-50 border-y border-slate-200 animate-in fade-in slide-in-from-top-2 duration-300">
                                          <div className="px-5 py-3 flex items-center justify-between bg-slate-100 border-b border-slate-200">
                                            <p className="text-sm font-bold text-slate-700">
                                              Daily Breakdown: <span className="text-blue-600">{s.name}</span>
                                              <span className="text-slate-400 font-normal ml-2">
                                                ({s.branch}{s.isPT && s.rate ? ` | Coach RM${s.rate}/hr, Exec RM${execRate}/hr` : ""})
                                              </span>
                                            </p>
                                            <p className="text-xs text-slate-500 font-medium">{s.days.length} day{s.days.length !== 1 ? "s" : ""} worked</p>
                                          </div>
                                          <div>
                                            <table className="w-full text-left">
                                              <thead>
                                                <tr className="text-xs font-bold uppercase tracking-wider bg-slate-50">
                                                  <th className="px-4 py-2 text-slate-400 w-12">No.</th>
                                                  <th className="px-4 py-2 text-slate-400">Day</th>
                                                  <th className="px-4 py-2 text-slate-400">Date</th>
                                                  <th className="px-4 py-2 text-orange-400 text-center">Coach Hr</th>
                                                  <th className="px-4 py-2 text-pink-400 text-center">Class</th>
                                                  <th className="px-4 py-2 text-indigo-400 text-center">Exec Hr</th>
                                                  <th className="px-4 py-2 text-blue-400 text-center">Total Hr</th>
                                                  {s.isPT && <th className="px-4 py-2 text-green-500 text-right">Pay (RM)</th>}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {allDaysInMonth.map((row) => {
                                                  const entry = workedMap[row.date];
                                                  const isWeekend = row.day === "Saturday" || row.day === "Sunday";
                                                  const worked = !!entry;
                                                  const dayPay = worked && s.isPT ? ((entry.coachHrs * (s.rate || 0)) + (entry.execHrs * execRate)) : 0;
                                                  const isReplacement = worked && entry.scheduleBranch;

                                                  return (
                                                    <tr key={row.date} className={`transition-colors ${
                                                      !worked ? "bg-slate-50/50 text-slate-300" :
                                                      isReplacement ? "bg-amber-50/50 hover:bg-amber-50/80" :
                                                      isWeekend ? "bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-slate-50/50"
                                                    }`}>
                                                      <td className="px-4 py-1.5 text-xs font-medium text-slate-400">{row.dayNum}</td>
                                                      <td className="px-4 py-1.5">
                                                        <span className={`text-xs font-bold ${!worked ? "text-slate-300" : isWeekend ? "text-blue-600" : "text-slate-600"}`}>
                                                          {row.day.slice(0, 3)}
                                                        </span>
                                                      </td>
                                                      <td className="px-4 py-1.5 text-xs text-slate-500">
                                                        {row.date}
                                                        {isReplacement && (
                                                          <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">@ {entry.scheduleBranch}</span>
                                                        )}
                                                      </td>
                                                      <td className="px-4 py-1.5 text-center text-xs font-bold">
                                                        <span className={worked ? "text-orange-600" : "text-slate-300"}>{worked ? fmtHrs(entry.coachHrs) : "-"}</span>
                                                      </td>
                                                      <td className="px-4 py-1.5 text-center text-xs font-bold">
                                                        <span className={worked && (entry.classCount ?? 0) > 0 ? "text-pink-600" : "text-slate-300"}>{worked && (entry.classCount ?? 0) > 0 ? entry.classCount : "-"}</span>
                                                      </td>
                                                      <td className="px-4 py-1.5 text-center text-xs font-bold">
                                                        <span className={worked ? "text-indigo-600" : "text-slate-300"}>{worked ? fmtHrs(entry.execHrs) : "-"}</span>
                                                      </td>
                                                      <td className="px-4 py-1.5 text-center text-xs font-black">
                                                        <span className={worked ? "text-blue-600" : "text-slate-300"}>{worked ? fmtHrs(entry.totalHrs) : "-"}</span>
                                                      </td>
                                                      {s.isPT && (
                                                        <td className="px-4 py-1.5 text-right text-xs font-black">
                                                          <span className={worked ? "text-green-600" : "text-slate-300"}>{worked ? `RM ${dayPay.toFixed(2)}` : "-"}</span>
                                                        </td>
                                                      )}
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                              <tfoot>
                                                <tr className="bg-slate-900 text-white">
                                                  <td colSpan={3} className="px-4 py-3 text-xs font-black uppercase">Monthly Total ({s.days.length} days worked)</td>
                                                  <td className="px-4 py-3 text-center text-xs font-black text-orange-300">{fmtHrs(s.coachHrs)}</td>
                                                  <td className="px-4 py-3 text-center text-xs font-black text-pink-300">{s.classCount ?? 0}</td>
                                                  <td className="px-4 py-3 text-center text-xs font-black text-indigo-300">{fmtHrs(s.execHrs)}</td>
                                                  <td className="px-4 py-3 text-center text-xs font-black text-blue-300">{fmtHrs(s.totalHrs)}</td>
                                                  {s.isPT && <td className="px-4 py-3 text-right text-sm font-black text-green-400">RM {s.totalPay.toFixed(2)}</td>}
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })()}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                      {filteredStaff.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-900 text-white">
                            <td colSpan={3} className="px-5 py-4 text-sm font-black uppercase tracking-wider">
                              Total ({filteredTotals.totalStaff} staff)
                            </td>
                            <td className="px-5 py-4 text-center text-sm font-bold text-orange-300">{fmtHrs(filteredTotals.totalCoachHrs)}</td>
                            <td className="px-5 py-4 text-center text-sm font-bold text-pink-300">{filteredTotals.totalClasses ?? 0}</td>
                            <td className="px-5 py-4 text-center text-sm font-bold text-indigo-300">{fmtHrs(filteredTotals.totalExecHrs)}</td>
                            <td className="px-5 py-4 text-center text-sm font-bold text-blue-300">{fmtHrs(filteredTotals.totalHrs)}</td>
                            {viewTab !== "ft" && (
                              <>
                                <td className="px-5 py-4"></td>
                                <td className="px-5 py-4 text-right text-lg font-black text-green-400">
                                  RM {filteredTotals.totalPay.toFixed(2)}
                                </td>
                              </>
                            )}
                            <td className="px-5 py-4"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
