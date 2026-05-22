/**
 * CRM utility functions.
 *
 * Covers:
 *  - Tailwind class merging (cn)
 *  - Malaysian Ringgit formatting (formatMYR)
 *  - Date / datetime formatting in Asia/Kuala_Lumpur timezone (formatDate, formatDateTime)
 *  - E.164 phone normalisation for +60 numbers (normalizePhone)
 *  - API key generation with SHA-256 hash (generateApiKey)
 *  - URL-safe slug generation (slugify)
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'
import { randomBytes, createHash } from 'crypto'

// ─── Tailwind class merging ───────────────────────────────────────────────────

/**
 * Merge Tailwind CSS class names, resolving conflicts correctly.
 * Combines clsx (conditional classes) with tailwind-merge (conflict resolution).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ─── Currency formatting ──────────────────────────────────────────────────────

const MYR_FORMATTER = new Intl.NumberFormat('ms-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format a numeric value as Malaysian Ringgit.
 * Accepts both `number` and numeric `string` (e.g. Prisma Decimal serialised as string).
 */
export function formatMYR(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return 'RM0.00'
  return MYR_FORMATTER.format(num)
}

// ─── Date / datetime formatting ───────────────────────────────────────────────

const KL_TIMEZONE = 'Asia/Kuala_Lumpur'

function toKLDate(date: Date | string): Date {
  const raw = typeof date === 'string' ? parseISO(date) : date
  if (!isValid(raw)) {
    throw new RangeError(`[CRM] Invalid date value: ${String(date)}`)
  }
  return toZonedTime(raw, KL_TIMEZONE)
}

/**
 * Format a date in Asia/Kuala_Lumpur timezone.
 *
 * @param date      JS Date or ISO string
 * @param formatStr date-fns format string (default: 'dd/MM/yyyy')
 */
export function formatDate(date: Date | string, formatStr = 'dd/MM/yyyy'): string {
  return format(toKLDate(date), formatStr)
}

/**
 * Format a datetime in Asia/Kuala_Lumpur timezone as 'dd/MM/yyyy HH:mm'.
 */
export function formatDateTime(date: Date | string): string {
  return format(toKLDate(date), 'dd/MM/yyyy HH:mm')
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a Malaysian phone number to E.164 format (+60…).
 * Uses libphonenumber-js with default country MY.
 * Returns the original string unchanged if parsing fails.
 */
export function normalizePhone(phone: string): string {
  if (!phone || phone.trim() === '') return phone

  try {
    const trimmed = phone.trim()

    // Fast path: already valid E.164
    if (isValidPhoneNumber(trimmed, 'MY')) {
      const parsed = parsePhoneNumber(trimmed, 'MY')
      return parsed.format('E.164')
    }

    // Attempt parsing with default country MY
    const parsed = parsePhoneNumber(trimmed, 'MY')
    if (parsed.isValid()) {
      return parsed.format('E.164')
    }
  } catch {
    // Fall through to return original
  }

  return phone
}

// ─── API key generation ───────────────────────────────────────────────────────

/**
 * Generate a new CRM API key pair.
 *
 * @returns
 *   - `key`    The plain-text key shown to the user once (store nothing or show once)
 *   - `hashed` SHA-256 hex digest stored in `crm_api_key.hashedKey`
 */
export function generateApiKey(): { key: string; hashed: string } {
  const entropy = randomBytes(32).toString('hex')
  const key = `ek_${entropy}`
  const hashed = createHash('sha256').update(key, 'utf8').digest('hex')
  return { key, hashed }
}

// ─── Slug generation ──────────────────────────────────────────────────────────

/**
 * Convert a string to a URL-safe, lowercase slug.
 *
 * - Converts to lowercase
 * - Replaces runs of non-alphanumeric characters with a single hyphen
 * - Strips leading and trailing hyphens
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
