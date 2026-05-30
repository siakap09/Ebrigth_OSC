import { PrismaClient } from '@prisma/client'

// Second Prisma client, pointed directly at the ebright_hrfs database
// (public schema) rather than the crm schema. The default `prisma` client in
// lib/prisma.ts connects with `?schema=crm`, where `BranchStaff` is only a
// read-only FDW VIEW (crm."BranchStaff" -> hrfs_remote."BranchStaff"). Reading
// the employee list through that view is indirect, and inserts through it fail
// with a misleading P2011 null-constraint error.
//
// HRFS_DATABASE_URL points at `...ebright_hrfs?schema=public`, so this client's
// `branchStaff` model (which carries @@map("BranchStaff") and no pinned schema)
// resolves to the real public."BranchStaff" table — the same 288 rows the crm
// view exposes, just read straight from the source.
const globalForHrfs = global as unknown as { hrfsPrisma: PrismaClient }

const hrfsUrl = process.env.HRFS_DATABASE_URL
if (!hrfsUrl) {
  throw new Error('HRFS_DATABASE_URL is not set — cannot initialise HRFS Prisma client')
}

export const hrfsPrisma: PrismaClient =
  globalForHrfs.hrfsPrisma ?? new PrismaClient({ datasourceUrl: hrfsUrl })

if (process.env.NODE_ENV !== 'production') globalForHrfs.hrfsPrisma = hrfsPrisma
