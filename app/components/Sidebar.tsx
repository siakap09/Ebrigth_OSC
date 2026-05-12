"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { isFullTime, isPartTime } from "@/lib/roles";

interface SidebarProps {
  sidebarOpen: boolean;
  onToggle?: () => void;
  onCollapse?: () => void;
}

const navigationItems = [
  { name: "Home", href: "/home", icon: "🏠" },
  { name: "Library", href: "/dashboards/library", icon: "📚" },
  { name: "Internal Dashboard", href: "/dashboards/internal-dashboard", icon: "📊" },
  { name: "HRMS", href: "/dashboards/hrms", icon: "👥" },
  { name: "CRM", href: "/dashboards/crm", icon: "📰" },
  { name: "SMS", href: "/dashboards/sms", icon: "💬" },
  { name: "Inventory", href: "/dashboards/inventory", icon: "📦" },
  { name: "Academy", href: "/academy", icon: "🎓" },
  { name: "Attendance", href: "/attendance", icon: "📅" },
  { name: "Account Management", href: "/account-management", icon: "🔐" },
];

// Paths PT/FT can actually navigate to (kept in sync with middleware.ts
// EMPLOYEE_ALLOWED_PATHS). Sidebar entries pointing elsewhere are shown but
// locked, so the user can see future modules without being able to enter
// them.
const EMPLOYEE_UNLOCKED_HREFS = new Set<string>([
  "/home",
  "/dashboards/hrms",
]);

export default function Sidebar({ sidebarOpen, onToggle, onCollapse }: SidebarProps) {
  const handleToggle = onToggle ?? onCollapse ?? (() => {});
  const { data: session } = useSession();
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  const isEmployeeOnly = isFullTime(role) || isPartTime(role);

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      handleToggle();
    }
  };

  return (
    <>
      {/* Fixed hamburger — always visible at top-left */}
      <button
        onClick={handleToggle}
        className="fixed top-3 left-3 z-[9999] p-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl shadow-md transition-all flex items-center justify-center"
        title={sidebarOpen ? "Close Sidebar" : "Open Sidebar"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile-only backdrop when drawer open */}
      {sidebarOpen && (
        <div
          onClick={handleToggle}
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar:
          - Mobile: fixed slide-in drawer over content (with backdrop)
          - Desktop: inline column that pushes content via width animation
      */}
      <aside
        className={`bg-white shadow-lg flex flex-col overflow-hidden transition-all duration-300
          fixed inset-y-0 left-0 z-50 w-64
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:z-auto md:translate-x-0 md:shrink-0 md:h-auto
          ${sidebarOpen ? "md:w-64" : "md:w-0"}
        `}
      >
        <nav className="p-6 pt-16 space-y-2 flex-1 overflow-y-auto">
          {navigationItems.map((item) => {
            const locked = isEmployeeOnly && !EMPLOYEE_UNLOCKED_HREFS.has(item.href);
            if (locked) {
              return (
                <div
                  key={item.name}
                  aria-disabled="true"
                  title="Locked — not available for your role yet"
                  className="w-full text-left flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-gray-400 bg-gray-50 whitespace-nowrap cursor-not-allowed opacity-60 select-none"
                >
                  <span className="grayscale">{item.icon}</span>
                  <span className="flex-1">{item.name}</span>
                  <span aria-hidden className="text-xs">🔒</span>
                </div>
              );
            }
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleNavClick}
                className="w-full text-left flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors text-gray-700 hover:bg-gray-100 whitespace-nowrap"
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

      </aside>
    </>
  );
}
