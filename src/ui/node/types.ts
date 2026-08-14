import type { DiffStatus, EntryKind } from '../../core/index.ts'
import type { GitRef } from './git.ts'

/**
 * Sentinel ref meaning "the working tree" — whatever committed snapshot
 * currently sits on disk (uncommitted edits included), read as-is. Every
 * side is a pure read; the UI never (re-)generates a snapshot itself.
 */
export const WORKING_TREE = 'WORKING_TREE'

/** Arguments accepted by the `get-payload` RPC. */
export interface PayloadRequest {
  /** Base side ref, or {@link WORKING_TREE}. */
  base: string
  /** Compare side ref, or {@link WORKING_TREE}. */
  compare: string
}

/**
 * A resolved (or unresolved) re-export target, present only on members with
 * `kind === 're-export'` that carry a source specifier. `packageName` /
 * `entryName` are only set when the specifier could be matched against a
 * known workspace package — external (npm) and unresolved relative
 * specifiers keep `specifier` but leave those unset, so the UI can still show
 * the raw specifier without a clickable link.
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
  /** Export name, e.g. `.` or `./utils`. */
  name: string
  members: MemberNode[]
}

/** Why a package might not render a full API tree. */
export type PackageStatus = 'ok' | 'no-api' | 'no-snapshot'

export interface PackageNode {
  name: string
  /** Directory relative to the workspace root. */
  dir: string
  entries: EntryNode[]
  status: PackageStatus
  note?: string
  /** Aggregate counts by diff status, for badges. */
  counts: Record<DiffStatus, number>
}

export interface SideMeta {
  kind: 'working' | 'ref'
  ref: string
  label: string
  resolved?: GitRef | null
}

export interface WorkspacePayload {
  root: string
  /** Whether this payload is a two-side diff (vs a single-state view). */
  isDiff: boolean
  /** Whether the workspace is a git repo (git features available). */
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
