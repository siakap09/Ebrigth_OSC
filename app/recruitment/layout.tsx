import type { Metadata } from 'next'
import { RecruitmentSidebar } from './_components/recruitment-sidebar'

export const metadata: Metadata = {
  title: 'Recruitment — Ebright HR',
  description: 'Ebright HR recruitment tracking',
}

// Access is enforced by middleware.ts (the /recruitment prefix is gated to
// SUPER_ADMIN / ADMIN / HR / HOD via the portal's NextAuth session). This
// layout just provides the module's own app shell — a dedicated emerald-themed
// sidebar + scrollable content area, mirroring how the CRM runs its own shell.
export default function RecruitmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <RecruitmentSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
