'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Search, Building2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/crm/utils'

interface Link {
  id: string
  userId: string
  branchId: string
  role: string
  createdAt: string
}

interface UserRow {
  id: string
  email: string
  name: string | null
  links: Link[]
}

interface BranchRow {
  id: string
  name: string
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((e as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export default function BranchAccessPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [granting, setGranting] = useState<UserRow | null>(null)

  const { data, isLoading } = useQuery<{ users: UserRow[]; branches: BranchRow[] }>({
    queryKey: ['branch-access'],
    queryFn: () => fetchJson('/api/crm/branch-access'),
  })

  const branchNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of data?.branches ?? []) m.set(b.id, b.name)
    return m
  }, [data])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const users = data?.users ?? []
    if (!q) return users
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const revokeMutation = useMutation({
    mutationFn: (linkId: string) =>
      fetchJson(`/api/crm/branch-access?id=${linkId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Access revoked')
      void qc.invalidateQueries({ queryKey: ['branch-access'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/crm/opportunities"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Manage Branch Access
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Grant branch managers and staff access to additional branches. Users only see branches they&apos;re linked to in the Agency View switcher.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {filteredUsers.length} of {data?.users.length ?? 0} user(s)
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Accessible Branches</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-100 align-top text-slate-800 last:border-0 dark:border-slate-700 dark:text-slate-200"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name ?? u.email}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {u.links.length === 0 ? (
                      <span className="text-xs italic text-slate-500 dark:text-slate-400">No branches assigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {u.links.map((link) => (
                          <span
                            key={link.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-700"
                          >
                            <Building2 className="h-3 w-3 text-slate-400" />
                            <span className="text-slate-700 dark:text-slate-200">
                              {branchNameById.get(link.branchId) ?? '?'}
                            </span>
                            <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                              {link.role}
                            </span>
                            <button
                              onClick={() => {
                                if (confirm(`Revoke ${u.email}'s access to ${branchNameById.get(link.branchId)}?`)) {
                                  revokeMutation.mutate(link.id)
                                }
                              }}
                              className="text-slate-400 hover:text-red-500"
                              title="Revoke"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setGranting(u)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Grant
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {granting && data && (
        <GrantDialog
          user={granting}
          branches={data.branches}
          existingBranchIds={new Set(granting.links.map((l) => l.branchId))}
          onClose={() => setGranting(null)}
        />
      )}
    </div>
  )
}

function GrantDialog({
  user,
  branches,
  existingBranchIds,
  onClose,
}: {
  user: UserRow
  branches: BranchRow[]
  existingBranchIds: Set<string>
  onClose: () => void
}) {
  const qc = useQueryClient()
  const available = branches.filter((b) => !existingBranchIds.has(b.id))
  const [branchId, setBranchId] = useState(available[0]?.id ?? '')
  const [role, setRole] = useState<'BRANCH_MANAGER' | 'BRANCH_STAFF'>('BRANCH_MANAGER')

  const grantMutation = useMutation({
    mutationFn: () =>
      fetchJson('/api/crm/branch-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, branchId, role }),
      }),
    onSuccess: () => {
      toast.success('Access granted')
      void qc.invalidateQueries({ queryKey: ['branch-access'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant branch access</DialogTitle>
          <DialogDescription>
            Give {user.name ?? user.email} access to an additional branch.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="branch">Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="branch" className="mt-1">
                <SelectValue placeholder="Pick a branch…" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">User already has every branch</div>
                ) : (
                  available.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="role">Role on this branch</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="role" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRANCH_MANAGER">Branch Manager</SelectItem>
                <SelectItem value="BRANCH_STAFF">Branch Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => grantMutation.mutate()}
            disabled={grantMutation.isPending || !branchId || available.length === 0}
          >
            {grantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Grant Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
