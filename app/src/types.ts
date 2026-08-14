// Wire types shared with the node side (src/ui/node/types.ts). Mirrored here so
// the SPA build never pulls the node-only module graph.

export const WORKING_TREE = 'WORKING_TREE'

export type EntryKind
  = | 'interface' | 'type' | 'enum' | 'class' | 'namespace'
    | 'function' | 'variable' | 'default' | 're-export' | 'referenced' | 'other'

export type DiffStatus = 'added' | 'removed' | 'modified' | 'widened' | 'unchanged'

/**
 * A resolved (or unresolved) re-export target, present only on members with
 * `kind === 're-export'` that carry a source specifier. `packageName` /
 * `entryName` are only set when the specifier could be matched against a
 * known workspace package.
 */
export interface ReExportTarget {
  specifier: string
  packageName?: string
  entryName?: string
}

export interface MemberNode {
  name: string
  display: string
  kind: EntryKind
  referenced: boolean
  status: DiffStatus
  base?: { runtime?: string, dts?: string }
  current?: { runtime?: string, dts?: string }
  /** Present only when `kind === 're-export'` and a source specifier was captured. */
  reExportTarget?: ReExportTarget
}

export interface EntryNode {
  name: string
  members: MemberNode[]
}

export type PackageStatus = 'ok' | 'no-api' | 'no-snapshot'

export interface PackageNode {
  name: string
  dir: string
  entries: EntryNode[]
  status: PackageStatus
  note?: string
  counts: Record<DiffStatus, number>
}

export interface GitRef {
  sha: string
  shortSha: string
  name: string
  type: 'branch' | 'tag' | 'commit'
  subject: string
  date?: string
}

export interface SideMeta {
  kind: 'working' | 'ref'
  ref: string
  label: string
  resolved?: GitRef | null
}

export interface WorkspacePayload {
  root: string
  isDiff: boolean
  git: boolean
  base: SideMeta
  compare: SideMeta
  packages: PackageNode[]
}

export interface RefsPayload {
  git: boolean
  branches: GitRef[]
  tags: GitRef[]
  commits: GitRef[]
  head: GitRef | null
}

export interface MetaPayload {
  cwd: string
  isStatic: boolean
  defaultBase: string
  defaultCompare: string
}

export interface PayloadRequest {
  base: string
  compare: string
}
