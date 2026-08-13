import type { DiffStatus, EntryKind, MemberNode } from './types.ts'

// @unocss-include

/** Phosphor icon class (presetIcons) per member kind. */
export const KIND_ICON: Record<EntryKind, string> = {
  'interface': 'i-ph-brackets-curly',
  'type': 'i-ph-shapes',
  'enum': 'i-ph-list-numbers',
  'class': 'i-ph-cube',
  'namespace': 'i-ph-folder-simple',
  'function': 'i-ph-function',
  'variable': 'i-ph-textbox',
  'default': 'i-ph-star',
  're-export': 'i-ph-arrow-bend-double-up-right',
  'referenced': 'i-ph-link',
  'other': 'i-ph-dot',
}

export const KIND_LABEL: Record<EntryKind, string> = {
  'interface': 'Interface',
  'type': 'Type',
  'enum': 'Enum',
  'class': 'Class',
  'namespace': 'Namespace',
  'function': 'Function',
  'variable': 'Variable',
  'default': 'Default export',
  're-export': 'Re-export',
  'referenced': 'Referenced (internal)',
  'other': 'Other',
}

export const KIND_GROUP_ORDER: EntryKind[] = [
  'interface',
  'type',
  'enum',
  'class',
  'namespace',
  'function',
  'variable',
  'default',
  're-export',
  'referenced',
  'other',
]

interface StatusStyle {
  label: string
  /** Tailwind/Uno text + border colour utilities. */
  text: string
  border: string
  /** Subtle background tint. */
  bg: string
  dot: string
  icon: string
}

/** Colour + label per diff status. Added=green, removed=red, modified=amber, widened=blue. */
export const STATUS_STYLE: Record<DiffStatus, StatusStyle> = {
  added: {
    label: 'Added',
    text: 'text-green-500',
    border: 'border-green-500/60',
    bg: 'bg-green-500/10',
    dot: 'bg-green-500',
    icon: 'i-ph-plus-circle',
  },
  removed: {
    label: 'Removed',
    text: 'text-red-500',
    border: 'border-red-500/60 border-dashed',
    bg: 'bg-red-500/10',
    dot: 'bg-red-500',
    icon: 'i-ph-minus-circle',
  },
  modified: {
    label: 'Narrowed',
    text: 'text-amber-500',
    border: 'border-amber-500/60',
    bg: 'bg-amber-500/10',
    dot: 'bg-amber-500',
    icon: 'i-ph-warning-circle',
  },
  widened: {
    label: 'Widened',
    text: 'text-blue-400',
    border: 'border-blue-400/60',
    bg: 'bg-blue-400/10',
    dot: 'bg-blue-400',
    icon: 'i-ph-arrows-out-line-horizontal',
  },
  unchanged: {
    label: 'Unchanged',
    text: 'text-gray-500',
    border: 'border-base',
    bg: 'bg-transparent',
    dot: 'bg-gray-500',
    icon: 'i-ph-equals',
  },
}

/** Explicit badge colour per status (`false` = neutral/muted), for DisplayBadge. */
export const STATUS_HEX: Record<DiffStatus, string | false> = {
  added: '#22c55e',
  removed: '#ef4444',
  modified: '#f59e0b',
  widened: '#60a5fa',
  unchanged: false,
}

export const ALL_STATUSES: DiffStatus[] = ['added', 'removed', 'modified', 'widened', 'unchanged']
/** Display order for grouping changes by type: removed, then narrowed, widened, added. */
export const CHANGED_STATUSES: DiffStatus[] = ['removed', 'modified', 'widened', 'added']

/** Which snapshot surface(s) an export appears in. */
export type MemberSource = 'runtime' | 'dts' | 'both' | 'none'

export const SOURCE_META: Record<MemberSource, { icon: string, label: string }> = {
  both: { icon: 'i-ph-circles-three-fill', label: 'runtime + types' },
  runtime: { icon: 'i-ph-lightning-fill', label: 'runtime only' },
  dts: { icon: 'i-ph-brackets-angle-bold', label: 'types only' },
  none: { icon: 'i-ph-dot', label: 'no signature' },
}

/**
 * Determine which surface(s) a member carries, preferring the current side and
 * falling back to the base side (e.g. for a removed member).
 */
export function sourceOf(m: MemberNode): MemberSource {
  const s = m.current ?? m.base ?? {}
  const hasRuntime = !!s.runtime?.trim()
  const hasDts = !!s.dts?.trim()
  if (hasRuntime && hasDts)
    return 'both'
  if (hasRuntime)
    return 'runtime'
  if (hasDts)
    return 'dts'
  return 'none'
}
