import type { DiffStatus, EntryKind, MemberNode, PackageNode, WorkspacePayload } from './types.ts'
import { KIND_GROUP_ORDER, KIND_LABEL, sourceOf } from './kind.ts'

export type NodeType = 'root' | 'package' | 'entry' | 'group' | 'member'

/** The three selectable states of the "Source" filter (`sourceOf()` also has a `'none'`, which is never shown by any of these — see `memberVisible`). */
export type SourceFilter = 'both' | 'runtime' | 'dts'

export interface TreeDatum {
  id: string
  type: NodeType
  label: string
  kind?: EntryKind
  status?: DiffStatus
  member?: MemberNode
  pkg?: PackageNode
  sub?: string
  children?: TreeDatum[]
}

export interface TreeFilter {
  search: string
  statuses: Set<DiffStatus>
  groupByKind: boolean
  showReferenced: boolean
  /** Package names to exclude entirely (from the `PackagesFilter` dropdown). */
  hiddenPackages: Set<string>
  /**
   * Only show members whose captured signature surface exactly matches
   * (`sourceOf(m) === source`). A member with no captured signature at all
   * (`sourceOf() === 'none'`) never matches any of the three states, so it's
   * never shown regardless of which is selected.
   */
  source: SourceFilter
}

function memberVisible(m: MemberNode, f: TreeFilter): boolean {
  if (!f.statuses.has(m.status))
    return false
  if (!f.showReferenced && m.referenced)
    return false
  if (sourceOf(m) !== f.source)
    return false
  if (f.search) {
    const q = f.search.toLowerCase()
    if (!m.display.toLowerCase().includes(q) && !m.kind.includes(q))
      return false
  }
  return true
}

function groupMembers(members: MemberNode[], entryId: string): TreeDatum[] {
  const byKind = new Map<EntryKind, MemberNode[]>()
  for (const m of members) {
    const list = byKind.get(m.kind) ?? []
    list.push(m)
    byKind.set(m.kind, list)
  }
  const groups: TreeDatum[] = []
  for (const kind of KIND_GROUP_ORDER) {
    const list = byKind.get(kind)
    if (!list || !list.length)
      continue
    groups.push({
      id: `${entryId}::${kind}`,
      type: 'group',
      label: KIND_LABEL[kind],
      kind,
      sub: String(list.length),
      children: list.map(m => memberDatum(m, `${entryId}::${kind}`)),
    })
  }
  return groups
}

function memberDatum(m: MemberNode, parentId: string): TreeDatum {
  return {
    id: `${parentId}::${m.name}`,
    type: 'member',
    label: m.display,
    kind: m.kind,
    status: m.status,
    member: m,
  }
}

export function buildTree(payload: WorkspacePayload, f: TreeFilter): TreeDatum {
  const packages: TreeDatum[] = []

  for (const pkg of payload.packages) {
    if (f.hiddenPackages.has(pkg.name))
      continue

    const entries: TreeDatum[] = []
    for (const entry of pkg.entries) {
      const visible = entry.members.filter(m => memberVisible(m, f))
      if (!visible.length)
        continue
      const entryId = `${pkg.name}::${entry.name}`
      entries.push({
        id: entryId,
        type: 'entry',
        label: entry.name,
        sub: String(visible.length),
        children: f.groupByKind ? groupMembers(visible, entryId) : visible.map(m => memberDatum(m, entryId)),
      })
    }

    const special = pkg.status !== 'ok'
    if (!entries.length && !special)
      continue

    packages.push({
      id: pkg.name,
      type: 'package',
      label: pkg.name,
      pkg,
      sub: pkg.dir,
      children: entries,
    })
  }

  return {
    id: '__root__',
    type: 'root',
    label: payload.root.split('/').pop() || 'workspace',
    children: packages,
  }
}
