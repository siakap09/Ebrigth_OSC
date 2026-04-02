"use client";

import Link from "next/link";

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
      { name: "Claims", href: "/claims", icon: "💰" },
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

// Add the userRole prop to the component!
export default function DashboardHome({ userRole }: { userRole?: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-center text-red-600 mb-2">
            Welcome
          </h1>
          <p className="text-center text-gray-600">{dashboards.length} accessible dashboards</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Dashboard Cards - Full Width Now */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {dashboards.map((dashboard) => {
                
                // Logic to check if this specific button should be disabled
                const isDisabled = userRole === "BRANCH_MANAGER" && dashboard.id !== "hrms";
                
                // Special cases for direct navigation
                const targetHref = dashboard.id === "academy" ? "/academy" : dashboard.id === "sms" ? "/sms" : `/dashboards/${dashboard.id}`;
                
                // If disabled, href becomes # so it doesn't go anywhere
                const href = isDisabled ? "#" : targetHref;

                return (
                  <Link key={dashboard.id} href={href} aria-disabled={isDisabled} className={isDisabled ? "pointer-events-none" : ""}>
                    <div className="cursor-pointer">
                      {/* Apply greyscale and opacity if disabled */}
                      <div className={`p-3 rounded-lg flex items-center justify-center gap-3 aspect-square transition-all duration-300
                        ${isDisabled ? 'bg-slate-300 text-slate-500 opacity-60 grayscale' : `${dashboard.color} text-white hover:shadow-lg`}
                      `}>
                        <div className="text-center">
                          <span className="text-2xl block mb-1">{dashboard.icon}</span>
                          <h2 className="text-sm font-bold">{dashboard.title}</h2>
                          
                          {/* Optional: Add a little lock icon so they know why it's grey */}
                          {isDisabled && (
                            <span className="text-[10px] uppercase font-black tracking-widest mt-2 block bg-slate-400/20 px-2 py-1 rounded">Locked</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}