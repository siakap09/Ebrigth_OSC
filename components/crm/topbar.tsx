'use client'

import { useRef, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  ChevronDown,
  Check,
  Building2,
  LogOut,
  UserCircle,
  UserCog,
  ArrowLeftRight,
  ChevronRight,
  RotateCcw,
  Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/crm/utils'
import { useBranchContext, type BranchInfo } from './branch-context'
import { authClient } from '@/lib/crm/auth-client'
import { useUnreadCount } from '@/hooks/crm/useNotifications'
import type { SessionUser } from './providers'
import { BranchAccessModal } from './branch-access-modal'

interface TopbarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  session: { user: SessionUser }
}

// ─── Avatar initials helper ───────────────────────────────────────────────────

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }
  return email?.slice(0, 2).toUpperCase() ?? '??'
}

// ─── Branch switcher ──────────────────────────────────────────────────────────

const VIEW_MODE_KEY = 'crm.branchSwitcherViewMode'

function BranchSwitcher({ user }: { user: SessionUser }) {
  const { branches, selectedBranch, setSelectedBranch, loading, viewerRole } = useBranchContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Branch whose access list is being managed (Agency View only).
  const [manageBranch, setManageBranch] = useState<BranchInfo | null>(null)
  // View mode is only meaningful for super admins — persists across reloads
  const [viewMode, setViewMode] = useState<'super' | 'agency'>('super')
  // `mounted` avoids hydration mismatch: server always renders the default
  // state; client swaps in localStorage-backed values on first effect pass.
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  // After picking a branch (or "View all"), send the user to that module's
  // dashboard so they're not stranded on a detail page that no longer applies
  // to the new scope. Ticket pages → ticket dashboard, anything else → CRM
  // dashboard. Pages already on a dashboard or settings page stay where they
  // are (the route re-renders against the new branch scope automatically).
  function defaultLandingPage(): string {
    if (pathname.startsWith('/crm/tickets') || pathname.startsWith('/crm/tkt-')) {
      return '/crm/tickets/dashboard'
    }
    return '/crm/dashboard'
  }

  function selectBranchAndNavigate(branch: BranchInfo | null) {
    setSelectedBranch(branch)
    setOpen(false)
    setQuery('')
    // Push to module-specific dashboard. If user is already on a dashboard,
    // this still re-fires the route — useful since the branch context change
    // alone may not trigger a refetch on every detail page.
    router.push(defaultLandingPage())
  }

  // "Admin" for the purposes of seeing the Super Admin / Agency View toggle.
  // Three sources are accepted:
  //   1. CRM role (from /api/crm/branches → `viewerRole`) — the source of truth
  //   2. Ticket role (legacy super_admin in tkt_user_profile)
  //   3. Email convention used during preview mode
  const isAdmin =
    viewerRole === 'SUPER_ADMIN' ||
    viewerRole === 'AGENCY_ADMIN' ||
    (user as { tktRole?: string | null }).tktRole === 'super_admin' ||
    user.email === 'admin@ebright.my'

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(VIEW_MODE_KEY) as 'super' | 'agency' | null
    if (saved === 'super' || saved === 'agency') setViewMode(saved)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function setMode(m: 'super' | 'agency') {
    setViewMode(m)
    if (typeof window !== 'undefined') localStorage.setItem(VIEW_MODE_KEY, m)
  }

  // Sort numerically by the "NN …" prefix. HR is excluded from dropdowns
  // entirely (no pipeline, no leads), so we no longer pin it. Any branches
  // without a numeric prefix sort alphabetically below the numbered set.
  const sorted = [...branches]
    .filter((b) => !/^Ebright HR$/i.test(b.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  const filtered = query
    ? sorted.filter(
        (b) =>
          b.name.toLowerCase().includes(query.toLowerCase()) ||
          (b.address ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : sorted

  // Labels — keep server + first client render identical, then update after mount.
  const defaultPanelLabel = !mounted
    ? isAdmin ? 'Super Admin View' : 'My Branch'
    : isAdmin
      ? viewMode === 'agency' ? 'Agency View' : 'Super Admin View'
      : branches.length > 0 ? branches[0].name : 'My Branch'

  const currentLabel = mounted ? (selectedBranch?.name ?? defaultPanelLabel) : defaultPanelLabel
  const currentSublabel = !mounted
    ? 'Loading…'
    : selectedBranch?.address ??
      (isAdmin
        // Admin who picked a specific branch is essentially impersonating the
        // branch-manager view — clearer than "Viewing all 23 branches".
        ? selectedBranch
          ? `Viewing as ${selectedBranch.name.replace(/^\d+\s+/, '')}`
          : `Viewing all ${branches.length || '—'} branches`
        : branches.length > 1
          ? `Viewing ${branches.length} accessible branches`
          : 'Your branch'
      )

  return (
    <div ref={ref} className="relative">
      {/* Trigger — GHL-style wide button with 2 lines */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex min-w-80 max-w-105 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition',
          'hover:border-indigo-300 hover:shadow-sm',
          'dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500',
        )}
      >
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          selectedBranch
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        )}>
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {currentLabel}
          </div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            {currentSublabel}
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-120 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
          {/* Admin-only view-mode toggle (Super Admin ↔ Agency View) */}
          {isAdmin && (
            <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-900">
              <button
                onClick={() => setMode('super')}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                  viewMode === 'super'
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                Super Admin View
              </button>
              <button
                onClick={() => setMode('agency')}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                  viewMode === 'agency'
                    ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                Agency View
              </button>
            </div>
          )}

          {/* Agency-only: Manage branch access */}
          {isAdmin && viewMode === 'agency' && (
            <button
              onClick={() => { router.push('/crm/settings/branch-access'); setOpen(false) }}
              className="flex w-full items-center gap-3 border-b border-slate-100 bg-indigo-50/60 px-3 py-2.5 text-sm transition hover:bg-indigo-100 dark:border-slate-700 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                <UserCog className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-300" />
              </div>
              <span className="flex-1 text-left font-medium text-indigo-700 dark:text-indigo-300">
                Manage branch access
              </span>
              <ChevronRight className="h-4 w-4 text-indigo-400" />
            </button>
          )}

          {/* Search */}
          <div className="border-b border-slate-100 p-3 dark:border-slate-700">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a sub-account"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* "View all" option — admins see all their branches at once */}
          {branches.length > 1 && (
            <button
              onClick={() => selectBranchAndNavigate(null)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2.5 text-sm transition',
                'hover:bg-slate-50 dark:hover:bg-slate-700',
                selectedBranch === null && 'bg-indigo-50 dark:bg-indigo-950/40',
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                <Building2 className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <span className="flex-1 text-left font-medium text-indigo-600 dark:text-indigo-400">
                {isAdmin
                  ? viewMode === 'agency' ? 'Switch to Agency View' : 'View all branches'
                  : 'All my branches'}
              </span>
              {selectedBranch === null && <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
            </button>
          )}

          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700">
            {isAdmin ? 'All Accounts' : 'Accessible Branches'}
          </div>

          {/* Branch list */}
          <div className="max-h-125 overflow-y-auto pb-1">
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                {query ? 'No matches' : 'No branches found'}
              </div>
            ) : (
              filtered.map((branch: BranchInfo) => {
                const selected = selectedBranch?.id === branch.id
                const showShare = isAdmin && viewMode === 'agency'
                return (
                  <div
                    key={branch.id}
                    className={cn(
                      'flex items-center gap-1 transition',
                      'hover:bg-slate-50 dark:hover:bg-slate-700',
                      selected && 'bg-indigo-50 dark:bg-indigo-950/40',
                    )}
                  >
                    <button
                      onClick={() => selectBranchAndNavigate(branch)}
                      className="flex flex-1 items-start gap-3 px-3 py-2.5 text-left min-w-0"
                    >
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        selected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                      )}>
                        {branch.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {branch.name}
                        </div>
                        {branch.address && (
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {branch.address}
                          </div>
                        )}
                      </div>
                      {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                    {showShare && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setManageBranch(branch)
                        }}
                        title="Manage who can view this branch"
                        className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Branch-access manager — opens from the share icon next to a branch */}
      {manageBranch && (
        <BranchAccessModal
          branchId={manageBranch.id}
          branchName={manageBranch.name}
          onClose={() => setManageBranch(null)}
        />
      )}
    </div>
  )
}

// ─── Global search ────────────────────────────────────────────────────────────

function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="relative hidden sm:block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search… (press /)"
        className="h-9 w-56 lg:w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      />
    </div>
  )
}

// ─── User menu ────────────────────────────────────────────────────────────────

interface PreviewUser {
  /** crm_auth_user.id, or null when the user only exists in HRMS yet. */
  id: string | null
  email: string
  name: string | null
  tktRole: string | null
  crmRole: string | null
  hrmsRole: string | null
  hrmsBranchName: string | null
  /** True if the user already has a crm_auth_user row. */
  provisioned: boolean
}

function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loginAsOpen, setLoginAsOpen] = useState(false)
  const [users, setUsers] = useState<PreviewUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setLoginAsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function openLoginAs() {
    setLoginAsOpen(true)
    if (users.length === 0) {
      setLoadingUsers(true)
      try {
        const res = await fetch('/api/crm/preview/users')
        if (res.ok) setUsers(await res.json())
      } catch {
        toast.error('Failed to load users')
      } finally {
        setLoadingUsers(false)
      }
    }
  }

  async function impersonate(userId: string | null, name: string | null, email: string) {
    // userId may be null for HRMS-only users — server provisions a crm_auth_user
    // row from the email when that happens.
    const payload = userId ? { userId } : { email }
    const res = await fetch('/api/crm/preview/login-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      toast.error('Failed to switch user')
      return
    }
    toast.success(`Now viewing as ${name ?? email}`)
    window.location.reload()
  }

  async function resetToDefault() {
    await fetch('/api/crm/preview/reset', { method: 'POST' })
    toast.success('Reset to default admin')
    window.location.reload()
  }

  function handleSignOut() {
    // Fire-and-forget Better Auth sign-out (no-op in preview mode)
    void authClient.signOut().catch(() => undefined)
    // Immediate navigation — do NOT await, browser follows the 302 to /login and sets cookies
    window.location.assign('/api/crm/preview/exit')
  }

  const filteredUsers = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : users

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold">
          {getInitials(user.name, user.email)}
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
      </button>

      {open && !loginAsOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-lg">
          {/* Identity */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {user.name ?? 'User'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {user.email}
            </p>
          </div>

          <button
            onClick={() => { router.push('/crm/settings/profile'); setOpen(false) }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <UserCircle className="h-4 w-4 text-slate-400" />
            Profile Settings
          </button>

          <button
            onClick={openLoginAs}
            className="flex w-full items-center justify-between gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <ArrowLeftRight className="h-4 w-4 text-slate-400" />
              Login As…
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </button>

          <button
            onClick={resetToDefault}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4 text-slate-400" />
            Reset to default admin
          </button>

          <hr className="my-1 border-slate-100 dark:border-slate-700" />

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}

      {open && loginAsOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <button
              onClick={() => setLoginAsOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Back"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Login as user</span>
          </div>

          <div className="p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                autoFocus
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto pb-1">
            {loadingUsers ? (
              <div className="py-6 text-center text-sm text-slate-500">Loading users…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No users found</div>
            ) : (
              filteredUsers.map((u) => {
                // Prefer the CRM-side role when available; fall back to HRMS
                // so HRMS-only users still display a role badge.
                const roleLabel = u.tktRole ?? u.crmRole ?? u.hrmsRole
                return (
                  <button
                    key={u.id ?? u.email}
                    onClick={() => impersonate(u.id, u.name, u.email)}
                    disabled={u.id !== null && u.id === user.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-700"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold dark:bg-indigo-900 dark:text-indigo-300">
                      {getInitials(u.name, u.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {u.name ?? u.email}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</span>
                        {!u.provisioned && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[9px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            new
                          </span>
                        )}
                      </div>
                    </div>
                    {roleLabel && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {roleLabel}
                      </span>
                    )}
                    {u.id !== null && u.id === user.id && <Check className="h-3.5 w-3.5 text-indigo-500" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function CrmTopbar({ collapsed, onToggleCollapse, session }: TopbarProps) {
  const router = useRouter()
  // Bell badge — polls /api/crm/notifications?filter=unread every 30s via React Query.
  // Branch scoping is automatic: the API filters by session.user.id, and leads-import
  // only creates notification rows for users with access to the lead's branch.
  const { data: unreadCount = 0 } = useUnreadCount()

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleCollapse}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5" />
        ) : (
          <PanelLeftClose className="h-5 w-5" />
        )}
      </button>

      {/* Branch switcher — visible to all authenticated users.
          Server-side, non-admins only see their assigned branch(es). */}
      <BranchSwitcher user={session.user} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Global search */}
      <GlobalSearch />

      {/* Notification bell */}
      <button
        onClick={() => router.push('/crm/notifications')}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* User menu */}
      <UserMenu user={session.user} />
    </header>
  )
}
