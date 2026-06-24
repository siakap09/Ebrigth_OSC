// Idempotent seed: attach each department account to its department platform as
// a branch-manager-level ticket admin (tkt_user_profile.role = 'platform_admin',
// linked ONLY to its own dept-* platform). This scopes them to triage just their
// department's tickets — even if they're CRM SUPER_ADMIN (marketing@/operation@),
// because requireTktAuth reads tkt_user_profile.role, not the CRM role.
//
// Resolves the account by EMAIL (the SSO bridge keys crm_auth_user by email).
// Does NOT create the user — if they've never logged in via portal yet, it
// skips them with a warning so the SSO bridge's first-login branch-link logic
// stays intact. Re-runs on every deploy, so accounts get picked up once they
// have logged in at least once.
//
// Run: docker exec ebright-osc-worker-1 node scripts/seed-department-accounts.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Keep in sync with lib/crm/departments.ts
const DEPARTMENTS = [
  { slug: 'dept-marketing', email: 'marketing@ebright.my' },
  { slug: 'dept-operation', email: 'operation@ebright.my' },
  { slug: 'dept-hr',        email: 'hr@gmail.com' },
  { slug: 'dept-finance',   email: 'finance@ebright.my' },
  { slug: 'dept-academy',   email: 'academy@gmail.com' },
  { slug: 'dept-ceo',       email: 'kevinkhoo@ebright.my' },
]

async function main() {
  const tenant =
    (await prisma.crm_tenant.findFirst({
      where: { slug: { in: ['ebright', 'ebright-demo'] } },
      select: { id: true, slug: true },
    })) ??
    (await prisma.crm_tenant.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, slug: true } }))
  if (!tenant) { console.error('[seed-dept-accounts] no tenant found'); process.exit(1) }
  console.log(`[seed-dept-accounts] tenant ${tenant.slug} (${tenant.id})`)

  for (const d of DEPARTMENTS) {
    const platform = await prisma.tkt_platform.findFirst({
      where: { tenant_id: tenant.id, slug: d.slug },
      select: { id: true },
    })
    if (!platform) {
      console.warn(`[seed-dept-accounts] platform ${d.slug} missing — run seed-department-platforms first; skipping ${d.email}`)
      continue
    }

    const user = await prisma.crm_auth_user.findUnique({ where: { email: d.email }, select: { id: true } })
    if (!user) {
      console.warn(`[seed-dept-accounts] ${d.email} not found — they must log in via portal once first; skipping`)
      continue
    }

    await prisma.tkt_user_profile.upsert({
      where: { user_id: user.id },
      create: { user_id: user.id, tenant_id: tenant.id, role: 'platform_admin' },
      update: { role: 'platform_admin' },
    })
    // Scope to ONLY their own department platform.
    await prisma.tkt_user_platform.deleteMany({ where: { user_id: user.id } })
    await prisma.tkt_user_platform.create({ data: { user_id: user.id, platform_id: platform.id } })

    console.log(`[seed-dept-accounts] ${d.email.padEnd(24)} -> platform_admin of ${d.slug}`)
  }
  console.log('[seed-dept-accounts] done')
}

main()
  .catch((e) => { console.error('[seed-dept-accounts]', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
