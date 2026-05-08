"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFAStore } from "@fa/_lib/store";
import { useCurrentUser } from "@fa/_hooks/useCurrentUser";
import { BRANCHES } from "@fa/_types";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ClipboardList,
  ChartBar,
  Package,
  LogOut,
} from "lucide-react";
import { useEffect } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MKT_NAV: NavItem[] = [
  { href: "/fa-system/marketing", label: "Events", icon: CalendarDays },
  { href: "/fa-system/marketing/inventory", label: "Inventory", icon: Package },
  { href: "/fa-system/shared/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/fa-system/shared/dashboard", label: "Dashboard", icon: ChartBar },
];

const BM_NAV: NavItem[] = [
  { href: "/fa-system/bm", label: "Events", icon: CalendarDays },
  { href: "/fa-system/shared/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/fa-system/shared/dashboard", label: "Dashboard", icon: ChartBar },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const logout = useFAStore(s => s.logout);
  const loadStudents = useFAStore(s => s.loadStudents);
  const studentsLoaded = useFAStore(s => s.studentsLoaded);
  const loadEvents = useFAStore(s => s.loadEvents);
  const eventsLoaded = useFAStore(s => s.eventsLoaded);

  useEffect(() => {
    if (!currentUser && pathname !== "/fa-system/login") {
      router.replace("/fa-system/login");
    }
  }, [currentUser, pathname, router]);

  useEffect(() => {
    if (currentUser && !studentsLoaded) loadStudents();
  }, [currentUser, studentsLoaded, loadStudents]);

  useEffect(() => {
    if (currentUser && !eventsLoaded) loadEvents();
  }, [currentUser, eventsLoaded, loadEvents]);

  if (!currentUser) return null;

  const nav = currentUser.role === "MKT" ? MKT_NAV : BM_NAV;
  const branchName = currentUser.branch
    ? BRANCHES.find(b => b.code === currentUser.branch)?.name
    : null;
  const roleLabel = currentUser.role === "MKT"
    ? "Marketing"
    : (branchName ?? currentUser.branch ?? "");

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-ivory-50 border-r border-gold-200 flex flex-col">

        {/* Brand masthead */}
        <div className="px-6 pt-7 pb-5">
          {/* Role kicker */}
          <div className="fa-mono text-[10px] uppercase text-gold-600 mb-3" style={{ letterSpacing: "0.12em" }}>
            {roleLabel}
          </div>

          {/* Wordmark */}
          <div className="fa-display-italic text-2xl text-ink-900 leading-none mb-4">
            Ebright
          </div>

          {/* Gold hairline */}
          <hr className="fa-rule-gold mb-3 border-0 border-t border-gold-300" />

          {/* System label */}
          <div className="fa-mono text-[11px] uppercase text-ink-500" style={{ letterSpacing: "0.1em" }}>
            FA System
          </div>
        </div>

        {/* Nav */}
        <nav className="px-3 flex-1 pb-2">
          {nav.map(item => {
            // Longest matching href wins so /marketing/inventory only highlights
            // "Inventory", not the broader "/fa-system/marketing" Events entry.
            const matchesItem = pathname === item.href || pathname.startsWith(item.href + "/");
            const moreSpecific = nav.some(o =>
              o !== item &&
              o.href.length > item.href.length &&
              (pathname === o.href || pathname.startsWith(o.href + "/"))
            );
            const active = matchesItem && !moreSpecific;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 px-3 py-[9px] rounded-[10px] text-sm font-medium mb-0.5 transition-colors duration-200 border-l-2 ${
                  active
                    ? "bg-ivory-100 text-ink-900 border-l-gold-400"
                    : "text-ink-600 hover:bg-ivory-100 hover:text-ink-900 border-l-transparent"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-gold-200">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full border border-gold-200 bg-ivory-50 text-ink-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink-900 truncate">{currentUser.name}</div>
            </div>
            <button
              onClick={() => { logout(); router.push("/fa-system/login"); }}
              className="p-1.5 text-ink-400 hover:text-gold-500 hover:bg-ivory-100 rounded-md flex-shrink-0 transition-colors duration-200"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
