// Run with: npx tsx scripts/cleanup-child-placeholders.ts [--dry-run]
//
// One-off cleanup for crm_contact rows that have a "Child N" placeholder
// firstName — emitted by the previous build's leads-import.ts when a sibling
// row had no usable name in children_details. The current build no longer
// creates these (it falls back to the parent's name instead), but the rows
// already in production still need to be converted to match.
//
// For every contact whose firstName matches /^Child \d+$/ AND has a
// parentFullName, this script:
//
//   1. Splits parentFullName into firstName + lastName.
//   2. Writes those back to the contact.
//   3. Clears parentFullName so the kanban renders it like a parent
//      submission (no redundant "parent" label beneath the same name).
//
// Idempotent: re-running won't re-process rows whose firstName no longer
// matches the placeholder pattern.
//
// The sibling-indexed externalSourceId is preserved, so contacts created
// from the same submission stay as distinct rows in the database — only
// the displayed name collapses to the parent's. The BM can edit the name
// in-place once they know which child this contact represents.

import { prisma } from '@/lib/crm/db'

const DRY_RUN = process.argv.includes('--dry-run')

function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (will UPDATE rows)'}`)

  const placeholders = await prisma.crm_contact.findMany({
    where: {
      deletedAt: null,
      firstName: { startsWith: 'Child ' },
      parentFullName: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      parentFullName: true,
      phone: true,
    },
  })

  console.log(`Found ${placeholders.length} placeholder rows.\n`)

  let updated = 0
  let skipped = 0

  for (const c of placeholders) {
    // Tight match — guard against names that happen to start with "Child" but
    // don't match the placeholder format ("Childes", "Child of Joy").
    if (!/^Child \d+$/.test(c.firstName)) {
      skipped++
      continue
    }
    if (!c.parentFullName) {
      skipped++
      continue
    }

    const { firstName, lastName } = splitName(c.parentFullName)
    if (!firstName) {
      console.warn(`  [skip] ${c.id} parentFullName "${c.parentFullName}" produced empty firstName`)
      skipped++
      continue
    }

    console.log(
      `  ${c.id}: "${c.firstName} ${c.lastName ?? ''}".trim() → "${firstName} ${lastName ?? ''}".trim()` +
        ` (phone: ${c.phone ?? '?'})`,
    )

    if (!DRY_RUN) {
      await prisma.crm_contact.update({
        where: { id: c.id },
        data: {
          firstName,
          lastName,
          parentFullName: null,
        },
      })
    }
    updated++
  }

  console.log('\n──────────────────────────')
  console.log(`Placeholders scanned: ${placeholders.length}`)
  console.log(`Updated:              ${updated}${DRY_RUN ? ' (would be)' : ''}`)
  console.log(`Skipped:              ${skipped}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
