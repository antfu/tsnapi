export interface ApiSnapshotOptions {
  /**
   * Snapshot output directory, relative to the project root.
   * @default '__snapshots__/tsnapi'
   */
  outputDir?: string

  /**
   * Extension for runtime snapshot files.
   * @default '.snapshot.js'
   */
  extensionRuntime?: string

  /**
   * Extension for DTS snapshot files.
   * @default '.snapshot.d.ts'
   */
  extensionDts?: string

  /**
   * Omit argument names from function signatures.
   * When true, runtime snapshots show empty parameter lists and
   * DTS snapshots replace parameter names with `_`.
   * @default true
   */
  omitArgumentNames?: boolean

  /**
   * Update snapshots instead of comparing.
   * When not set, auto-detected from `--update-snapshot` / `-u` CLI flags
   * or `UPDATE_SNAPSHOT=1` environment variable.
   */
  update?: boolean
}

export interface SnapshotResult {
  /** Whether any snapshots mismatched */
  hasChanges: boolean
  /** Per-entry mismatch details */
  mismatches: { name: string, runtimeChanged: boolean, dtsChanged: boolean }[]
  /** Formatted diff output for terminal (if mismatched) */
  diff: string | null
}

export interface ResolvedEntry {
  /** Export path, e.g. '.', './utils' */
  name: string
  /** Resolved JS file path */
  runtime: string | null
  /** Resolved DTS file path */
  dts: string | null
}
