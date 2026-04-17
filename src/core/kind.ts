export type EntryKind = 'interface' | 'type' | 'enum' | 'class' | 'function' | 'variable' | 'default' | 're-export' | 'other'

export interface Entry {
  name: string
  text: string
  kind: EntryKind
}

export const KIND_ORDER: EntryKind[] = ['interface', 'type', 'enum', 'class', 'function', 'variable', 'default', 're-export', 'other']
export const KIND_LABELS: Record<EntryKind, string> = {
  'interface': 'Interfaces',
  'type': 'Types',
  'enum': 'Enums',
  'class': 'Classes',
  'function': 'Functions',
  'variable': 'Variables',
  'default': 'Default Export',
  're-export': 'Re-exports',
  'other': 'Other',
}

export function formatGroupedEntries(entries: Entry[]): string {
  const groups = new Map<EntryKind, Entry[]>()
  for (const entry of entries) {
    const list = groups.get(entry.kind) ?? []
    list.push(entry)
    groups.set(entry.kind, list)
  }

  const sections: string[] = []
  for (const kind of KIND_ORDER) {
    const group = groups.get(kind)
    if (!group || group.length === 0)
      continue
    group.sort((a, b) => a.name.localeCompare(b.name))
    sections.push(`// #region ${KIND_LABELS[kind]}\n${group.map(e => e.text).join('\n')}\n// #endregion`)
  }

  return `${sections.join('\n\n')}\n`
}
