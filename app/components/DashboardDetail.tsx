"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isHR, isAcademy, isBranchManager, isFullTime, isPartTime } from "@/lib/roles";

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
      { name: "Claims", href: "/claim", icon: "💰" },
      { name: "Attendance", href: "/attendance", icon: "⏰" },
      { name: "Onboarding", href: "/onboarding", icon: "🟢" },
      { name: "Offboarding", href: "/offboarding", icon: "🔴" },
      { name: "HR Dashboard", href: "/hr-dashboard", icon: "📋" },
      { name: "Manpower Cost Report", href: "/manpower-cost-report", icon: "💸" },
      { name: "FA System", href: "/fa-system", icon: "🎗️" },
    ],
  },
  {
    id: "crm",
    title: "CRM",
    icon: "📊",
    color: "bg-yellow-500",
    items: [
      // Lead and Ticket are the only CRM entry points — both land on their
      // respective dashboards first, where users drill into kanban / lists.
      { name: "Lead",   href: "/crm/dashboard",         icon: "📋" },
      { name: "Ticket", href: "/crm/tickets/dashboard", icon: "🎫" },
    ],
  },
  {
    id: "cms",
    title: "CMS",
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

interface DashboardDetailProps {
  id: string;
}

export default function DashboardDetail({ id }: DashboardDetailProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  const userIsBM = isBranchManager(role);
  const userIsHR = isHR(role);
  const userIsAcademy = isAcademy(role);
  const userIsEmployee = isFullTime(role) || isPartTime(role);
  const dashboard = dashboards.find((d) => d.id === id);

  // Per-role sub-item visibility on the HRMS hub. Roles not handled below
  // (SUPER_ADMIN, ADMIN, HOD, ...) see every sub-item enabled.
  const isItemEnabled = (href: string) => {
    if (id !== "hrms") return true;
    if (userIsBM)       return href === "/manpower-schedule" || href === "/fa-system";
    if (userIsHR)       return href !== "/manpower-schedule";
    if (userIsAcademy)  return href === "/dashboard-employee-management";
    if (userIsEmployee) return href === "/manpower-cost-report";
    return true;
  };

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Dashboard Not Found</h1>
          <button
            onClick={() => router.push('/home')}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      
      {/* Header Box */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 mb-8">
        <div className={`${dashboard.color} text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-md`}>
          <span className="text-xl">{dashboard.icon}</span>
          <h1 className="text-lg font-black uppercase tracking-wide m-0 leading-none">
            {dashboard.title}
          </h1>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dashboard.items.map((item) => {
          const enabled = isItemEnabled(item.href);
          if (!enabled) {
            return (
              <div
                key={item.name}
                aria-disabled="true"
                className="bg-slate-100 rounded-2xl shadow-sm border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-center cursor-not-allowed opacity-50"
              >
                <span className="text-5xl mb-4 grayscale">{item.icon}</span>
                <h2 className="text-lg font-black text-slate-500 uppercase tracking-tight">{item.name}</h2>
              </div>
            );
          }
          return (
            <Link key={item.name} href={item.href}>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer p-8 h-full flex flex-col items-center justify-center text-center">
                <span className="text-5xl mb-4">{item.icon}</span>
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">{item.name}</h2>
              </div>
            </Link>
          );
        })}
      </div>

    </div>
  );
}