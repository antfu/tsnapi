import type { DiffStatus, EntryKind } from '../../core/index.ts'
import type { GitRef } from './git.ts'

/** Sentinel ref meaning "the working tree" (live dist extraction). */
export const WORKING_TREE = 'WORKING_TREE'

/** Extraction knobs the UI can tweak to match a repo's tsnapi config. */
export interface UiExtractOptions {
  omitArgumentNames: boolean
  typeWidening: boolean
  referenceTracingDepth: number
}

export const DEFAULT_EXTRACT_OPTIONS: UiExtractOptions = {
  omitArgumentNames: true,
  typeWidening: true,
  referenceTracingDepth: 1,
}

/** Arguments accepted by the `get-payload` RPC. */
export interface PayloadRequest {
  /** Base side ref, or {@link WORKING_TREE}. */
  base: string
  /** Compare side ref, or {@link WORKING_TREE}. */
  compare: string
  options?: Partial<UiExtractOptions>
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
  /** Export name, e.g. `.` or `./utils`. */
  name: string
  members: MemberNode[]
}

/** Why a package might not render a full API tree. */
export type PackageStatus = 'ok' | 'unbuilt' | 'no-api' | 'no-snapshot'

export interface PackageNode {
  name: string
  /** Directory relative to the workspace root. */
  dir: string
  entries: EntryNode[]
  status: PackageStatus
  /**
   * True when the working-tree side had no built dist and fell back to the
   * committed snapshot on disk.
   */
  usedFallback: boolean
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
  options: UiExtractOptions
}

export interface RefsPayload {
  git: boolean
  branches: GitRef[]
  tags: GitRef[]
  commits: GitRef[]
  head: GitRef | null
}
