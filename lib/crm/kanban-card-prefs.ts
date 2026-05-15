/**
 * Per-browser preferences for what to show on the kanban lead cards.
 *
 * Stored in localStorage (chosen over server-side persistence for v1 — keeps
 * the feature shippable without a schema change). The drawer in
 * components/crm/opportunities/customise-card-drawer.tsx is the only writer;
 * KanbanBoard reads on mount and re-reads when the drawer closes.
 */

export type CardLayout = 'default' | 'compact'

/** Identifiers for each toggleable field on the card. */
export type CardFieldKey =
  | 'name'              // Always on, locked.
  | 'parentName'        // Parent's full name (when contact represents a child).
  | 'ageCategory'       // Junior / Mid / Senior pill next to child name.
  | 'leadSource'        // fb / tt / ig / rf / wa platform icon.
  | 'value'             // RM amount (only shows when value > 0).
  | 'lastStageChange'   // "about 3 hours ago" relative timestamp.
  | 'tags'              // Smart tags row.
  | 'owner'             // Assigned user avatar.
  | 'stageBadge'        // Short-code pill at the bottom (NL / FU1 / CT / ...).

export type QuickActionKey =
  | 'call'
  | 'conversations'
  | 'tags'
  | 'notes'
  | 'tasks'
  | 'appointment'

export interface CardPrefs {
  layout: CardLayout
  fields: CardFieldKey[]
  quickActions: QuickActionKey[]
}

/**
 * Defaults match the existing kanban card layout so toggling the feature on
 * for the first time doesn't visibly change anything for the user.
 */
export const DEFAULT_CARD_PREFS: CardPrefs = {
  layout: 'default',
  fields: ['name', 'parentName', 'ageCategory', 'leadSource', 'lastStageChange', 'owner', 'stageBadge'],
  quickActions: ['notes', 'tags', 'appointment'],
}

/** All field options the drawer renders, in display order. The `locked` flag
 *  marks fields the user can't deselect (always rendered on the card). */
export const ALL_CARD_FIELDS: Array<{ key: CardFieldKey; label: string; locked?: boolean }> = [
  { key: 'name',             label: 'Lead Name', locked: true },
  { key: 'parentName',       label: 'Parent Name' },
  { key: 'ageCategory',      label: 'Age Category' },
  { key: 'leadSource',       label: 'Lead Source' },
  { key: 'value',            label: 'Value (RM)' },
  { key: 'lastStageChange',  label: 'Last Moved (relative)' },
  { key: 'tags',             label: 'Tags' },
  { key: 'owner',            label: 'Owner' },
  { key: 'stageBadge',       label: 'Stage Badge' },
]

export const ALL_QUICK_ACTIONS: Array<{ key: QuickActionKey; label: string }> = [
  { key: 'call',          label: 'Call' },
  { key: 'conversations', label: 'Unread conversations' },
  { key: 'tags',          label: 'Tags' },
  { key: 'notes',         label: 'Notes' },
  { key: 'tasks',         label: 'Tasks' },
  { key: 'appointment',   label: 'Upcoming Confirmed Appointment' },
]

const STORAGE_KEY = 'crm.kanban.cardPrefs.v1'

export function loadCardPrefs(): CardPrefs {
  if (typeof window === 'undefined') return DEFAULT_CARD_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CARD_PREFS
    const parsed = JSON.parse(raw) as Partial<CardPrefs>
    return {
      layout:        parsed.layout === 'compact' ? 'compact' : 'default',
      fields:        Array.isArray(parsed.fields) ? parsed.fields.filter(isFieldKey) : DEFAULT_CARD_PREFS.fields,
      quickActions:  Array.isArray(parsed.quickActions) ? parsed.quickActions.filter(isQuickActionKey) : DEFAULT_CARD_PREFS.quickActions,
    }
  } catch {
    return DEFAULT_CARD_PREFS
  }
}

export function saveCardPrefs(prefs: CardPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage may be full or disabled — best-effort persistence.
  }
}

function isFieldKey(v: unknown): v is CardFieldKey {
  return typeof v === 'string' && ALL_CARD_FIELDS.some((f) => f.key === v)
}

function isQuickActionKey(v: unknown): v is QuickActionKey {
  return typeof v === 'string' && ALL_QUICK_ACTIONS.some((a) => a.key === v)
}
