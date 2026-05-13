"use client";

import Link from "next/link";
import { canSeeKey } from "@/lib/dashboard-access";
import { useMyPermissions } from "@/lib/use-my-permissions";

interface DashboardCard {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: {
    name: string;
    href: string;
    icon: string;
  }[];
}

const dashboards: DashboardCard[] = [
  {
    id: "library",
    title: "Library",
    icon: "📚",
    color: "bg-purple-500",
    items: [
      { name: "Documents", href: "#", icon: "📄" },
      { name: "Resources", href: "#", icon: "📁" },
    ],
  },
  {
    id: "internal-dashboard",
    title: "Internal Dashboard",
    icon: "📊",
    color: "bg-green-500",
    items: [
      { name: "Analytics", href: "#", icon: "📈" },
      { name: "Reports", href: "#", icon: "📋" },
    ],
  },
  {
    id: "hrms",
    title: "HRMS",
    icon: "👥",
    color: "bg-blue-500",
    items: [
      { name: "Employee Dashboard", href: "/dashboard-employee-management", icon: "📊" },
      { name: "Manpower Planning", href: "/manpower-schedule", icon: "🗂️" },
      { name: "Attendance", href: "/attendance", icon: "📅" },
      { name: "Claims", href: "/claim", icon: "💰" },
      { name: "Manpower Cost Report", href: "/manpower-cost-report", icon: "💸" },
    ],
  },
  {
    id: "crm",
    title: "CRM",
    icon: "📰",
    color: "bg-yellow-500",
    items: [
      { name: "Content Manager", href: "#", icon: "✏️" },
      { name: "Media", href: "#", icon: "🖼️" },
    ],
  },
  {
    id: "sms",
    title: "SMS",
    icon: "💬",
    color: "bg-indigo-500",
    items: [
      { name: "Messages", href: "#", icon: "💌" },
      { name: "Templates", href: "#", icon: "📧" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: "📦",
    color: "bg-pink-500",
    items: [
      { name: "Stock Management", href: "#", icon: "📊" },
      { name: "Warehouse", href: "#", icon: "🏭" },
    ],
  },
  {
    id: "academy",
    title: "Academy",
    icon: "🎓",
    color: "bg-indigo-600",
    items: [
      { name: "Event Management", href: "/academy", icon: "📅" },
      { name: "Courses", href: "#", icon: "📖" },
    ],
  },
];

export default function DashboardHome({ userRole }: { userRole?: string; userEmail?: string }) {
  // Prefer session role from the hook (live) over the prop (server-rendered).
  // Falls back to the prop for SSR / non-hook callers.
  const { role: sessionRole, overrides } = useMyPermissions();
  const effectiveRole = (sessionRole as string | undefined) ?? userRole;

  const accessibleCount = dashboards.filter((d) => canSeeKey(effectiveRole, d.id, overrides)).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-center text-red-600 mb-1 sm:mb-2">Welcome</h1>
          <p className="text-center text-sm sm:text-base text-gray-600">{accessibleCount} accessible dashboard{accessibleCount !== 1 ? "s" : ""}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
          {dashboards.map((dashboard) => {
            const isDisabled = !canSeeKey(effectiveRole, dashboard.id, overrides);

const targetHref =
  dashboard.id === "academy" ? "/academy" :
  dashboard.id === "inventory" ? "/api/launch-inventory" :
  `/dashboards/${dashboard.id}`;

const href = isDisabled ? "#" : targetHref;

            return (
              <Link key={dashboard.id} href={href} aria-disabled={isDisabled} className={isDisabled ? "pointer-events-none" : ""}>
                <div className={`p-2 sm:p-3 rounded-lg flex items-center justify-center gap-3 aspect-square transition-all duration-300
                  ${isDisabled ? "bg-slate-300 text-slate-500 opacity-60 grayscale" : `${dashboard.color} text-white hover:shadow-lg hover:scale-105`}
                `}>
                  <div className="text-center">
                    <span className="text-2xl sm:text-3xl block mb-1">{dashboard.icon}</span>
                    <h2 className="text-xs sm:text-sm font-bold leading-tight">{dashboard.title}</h2>
                    {isDisabled && (
                      <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest mt-2 block bg-slate-400/20 px-2 py-1 rounded">Locked</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
