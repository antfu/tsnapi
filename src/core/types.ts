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
   * Add a header comment to snapshot files indicating how they were generated.
   * @default true
   */
  header?: boolean

  /**
   * Omit argument names from function signatures.
   * When true, runtime snapshots show empty parameter lists and
   * DTS snapshots replace parameter names with `_`.
   * @default true
   */
  omitArgumentNames?: boolean

  /**
   * Widen literal types to their base types in snapshots.
   * When true, `const VERSION = "2.0.0"` becomes `const VERSION: string` in DTS
   * and values are stripped in runtime snapshots.
   * When false, literal values are preserved as-is.
   * @default true
   */
  typeWidening?: boolean

  /**
   * Group exports by kind (class, function, variable, etc.) with section headers.
   * @default true
   */
  categorizedExports?: boolean

  /**
   * Update snapshots instead of comparing.
   * When not set, auto-detected from `--update-snapshot` / `-u` CLI flags
   * or `UPDATE_SNAPSHOT=1` environment variable.
   */
  update?: boolean

  /**
   * Allow breaking API changes when updating snapshots.
   *
   * While updating (see {@link update}), tsnapi classifies each change as
   * additive (new exports, new interface members, wider unions, extra
   * parameters) or breaking (something was removed or narrowed). Breaking
   * changes abort the update without writing, unless this is `true`.
   *
   * When not set, auto-detected from the `--allow-breaking` CLI flag or the
   * `TSNAPI_ALLOW_BREAKING=1` environment variable.
   * @default false
   */
  allowBreaking?: boolean
}

export interface SnapshotResult {
  /** Whether any snapshots mismatched */
  hasChanges: boolean
  /** Per-entry mismatch details */
  mismatches: { name: string, runtimeChanged: boolean, dtsChanged: boolean }[]
  /** Formatted diff output for terminal (if mismatched) */
  diff: string | null
  /**
   * Breaking API changes that blocked an update. Empty unless snapshots were
   * updated with the breaking-change guard active (see `allowBreaking`).
   */
  breaking: import('./breaking.ts').BreakingChange[]
}

export interface ResolvedEntry {
  /** Export path, e.g. '.', './utils' */
  name: string
  /** Resolved JS file path */
  runtime: string | null
  /** Resolved DTS file path */
  dts: string | null
}
