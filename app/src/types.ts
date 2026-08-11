// Wire types shared with the node side (src/ui/node/types.ts). Mirrored here so
// the SPA build never pulls the node-only module graph.

export const WORKING_TREE = 'WORKING_TREE'

export type EntryKind
  = | 'interface' | 'type' | 'enum' | 'class' | 'namespace'
    | 'function' | 'variable' | 'default' | 're-export' | 'referenced' | 'other'

export type DiffStatus = 'added' | 'removed' | 'modified' | 'widened' | 'unchanged'

export interface UiExtractOptions {
  omitArgumentNames: boolean
  typeWidening: boolean
  referenceTracingDepth: number
}

export interface MemberNode {
  name: string
  display: string
  kind: EntryKind
  referenced: boolean
  status: DiffStatus
  base?: { runtime?: string, dts?: string }
  current?: { runtime?: string, dts?: string }
}

export interface EntryNode {
  name: string
  members: MemberNode[]
}

export type PackageStatus = 'ok' | 'unbuilt' | 'no-api' | 'no-snapshot'

export interface PackageNode {
  name: string
  dir: string
  entries: EntryNode[]
  status: PackageStatus
  usedFallback: boolean
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
  options: UiExtractOptions
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
  options: UiExtractOptions
}

export interface PayloadRequest {
  base: string
  compare: string
  options?: Partial<UiExtractOptions>
}
