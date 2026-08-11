import type { DiffStatus, EntryKind } from './types.ts'

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
  dot: string
  icon: string
}

/** Colour + label per diff status. Added=green, removed=red, modified=amber, widened=blue. */
export const STATUS_STYLE: Record<DiffStatus, StatusStyle> = {
  added: { label: 'Added', text: 'text-green-500', border: 'border-green-500/60', dot: 'bg-green-500', icon: 'i-ph-plus-circle' },
  removed: { label: 'Removed', text: 'text-red-500', border: 'border-red-500/60', dot: 'bg-red-500', icon: 'i-ph-minus-circle' },
  modified: { label: 'Modified (narrowed)', text: 'text-amber-500', border: 'border-amber-500/60', dot: 'bg-amber-500', icon: 'i-ph-warning-circle' },
  widened: { label: 'Widened', text: 'text-blue-400', border: 'border-blue-400/60', dot: 'bg-blue-400', icon: 'i-ph-arrows-out-line-horizontal' },
  unchanged: { label: 'Unchanged', text: 'text-gray-500', border: 'border-base', dot: 'bg-gray-500', icon: 'i-ph-equals' },
}

export const ALL_STATUSES: DiffStatus[] = ['added', 'removed', 'modified', 'widened', 'unchanged']
export const CHANGED_STATUSES: DiffStatus[] = ['added', 'removed', 'modified', 'widened']
