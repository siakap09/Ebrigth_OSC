// Idempotent seed: the 6 internal-department ticket platforms.
//
// Each department (Marketing, Operation, HR, Finance, Academy, CEO) is a
// tkt_platform identified by a `dept-*` slug. Branches submit a ticket under
// "Others" and pick the department; the department account (platform_admin of
// its own platform) then triages it on its Opportunities board. Existing
// platforms (Aone, Lead, Process Street, ClickUp) stay super-admin-only.
//
// Safe to re-run — upserts by (tenant_id, slug). Mirrors keep this script and
// lib/crm/departments.ts in sync.
//
// Run: docker exec ebright-osc-worker-1 node scripts/seed-department-platforms.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEPARTMENTS = [
  { slug: 'dept-marketing', name: 'Marketing', code: 'MKT', accent: '#db2777' },
  { slug: 'dept-operation', name: 'Operation', code: 'OPS', accent: '#2563eb' },
  { slug: 'dept-hr',        name: 'HR',         code: 'HR',  accent: '#16a34a' },
  { slug: 'dept-finance',   name: 'Finance',    code: 'FIN', accent: '#ca8a04' },
  { slug: 'dept-academy',   name: 'Academy',    code: 'ACD', accent: '#9333ea' },
  { slug: 'dept-ceo',       name: 'CEO',        code: 'CEO', accent: '#dc2626' },
]

async function main() {
  const tenant =
    (await prisma.crm_tenant.findFirst({
      where: { slug: { in: ['ebright', 'ebright-demo'] } },
      select: { id: true, slug: true },
    })) ??
    (await prisma.crm_tenant.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, slug: true } }))

  if (!tenant) {
    console.error('[seed-departments] no tenant found — aborting')
    process.exit(1)
  }
  console.log(`[seed-departments] tenant ${tenant.slug} (${tenant.id})`)

  for (const d of DEPARTMENTS) {
    const row = await prisma.tkt_platform.upsert({
      where: { tenant_id_slug: { tenant_id: tenant.id, slug: d.slug } },
      create: { tenant_id: tenant.id, name: d.name, slug: d.slug, code: d.code, accent_color: d.accent },
      update: { name: d.name, code: d.code, accent_color: d.accent },
    })
    console.log(`[seed-departments] ${d.slug.padEnd(16)} -> ${row.id}`)
  }
  console.log('[seed-departments] done')
}

main()
  .catch((e) => { console.error('[seed-departments]', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
