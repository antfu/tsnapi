import type { SnapshotExtensions } from './snapshot.ts'
import type { ApiSnapshotOptions, ResolvedEntry, SnapshotResult } from './types.ts'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { extractDts } from './extract-dts.ts'
import { extractRuntime } from './extract-runtime.ts'
import { resolvePackageEntries } from './resolve.ts'
import {
  compareSnapshots,
  formatMismatchError,
  generateHeader,
  readSnapshot,
  writeSnapshot,
} from './snapshot.ts'

export { extractDts } from './extract-dts.ts'
export { extractRuntime } from './extract-runtime.ts'
export { resolvePackageEntries } from './resolve.ts'
export type { SnapshotExtensions, SnapshotFile, SnapshotMismatch } from './snapshot.ts'
export { compareSnapshots, formatMismatchError, generateHeader, readSnapshot, stripHeader, writeSnapshot } from './snapshot.ts'
export type { ApiSnapshotOptions, ResolvedEntry, SnapshotResult } from './types.ts'

function readPackageName(cwd: string): string {
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.name)
        return pkg.name
    }
    catch {}
  }
  return 'unknown'
}

function resolveOptions(options?: ApiSnapshotOptions): {
  outputDir: string
  ext: SnapshotExtensions
  update: boolean
} {
  const outputDir = options?.outputDir ?? '__snapshots__/tsnapi'
  const ext: SnapshotExtensions = {
    runtime: options?.extensionRuntime ?? '.snapshot.js',
    dts: options?.extensionDts ?? '.snapshot.d.ts',
  }
  const update = resolveUpdateMode(options?.update)
  return { outputDir, ext, update }
}

function resolveUpdateMode(explicit?: boolean): boolean {
  if (explicit != null)
    return explicit
  const env = process.env.UPDATE_SNAPSHOT
  if (env === '1' || env === 'true')
    return true
  return process.argv.includes('--update-snapshot') || process.argv.includes('-u')
}

/**
 * Extract the public API surface of a package as snapshot strings,
 * without writing to disk or comparing against existing snapshots.
 *
 * Returns a record keyed by entry name (e.g. `'.'`, `'./utils'`),
 * each containing `runtime` and `dts` snapshot strings.
 *
 * Useful for integrating with Vitest's snapshot system:
 * ```ts
 * const api = generateApiSnapshot(process.cwd())
 * expect(api['.'].dts).toMatchSnapshot()
 * ```
 */
export function generateApiSnapshot(cwd: string, options?: ApiSnapshotOptions): Record<string, { runtime: string, dts: string }> {
  const entries = resolvePackageEntries(cwd)
  const result: Record<string, { runtime: string, dts: string }> = {}
  const extractOptions = { omitArgumentNames: options?.omitArgumentNames }
  const showHeader = options?.header ?? true
  const packageName = showHeader ? readPackageName(cwd) : ''

  for (const entry of entries) {
    const runtime = entry.runtime
      ? extractRuntime(entry.runtime, readFileSync(entry.runtime, 'utf-8'), extractOptions)
      : ''
    const dts = entry.dts
      ? extractDts(entry.dts, readFileSync(entry.dts, 'utf-8'), extractOptions)
      : ''
    const prefix = showHeader ? generateHeader(packageName, entry.name) : ''
    result[entry.name] = {
      runtime: prefix + (runtime.trim() || '/* no exports */'),
      dts: prefix + (dts.trim() || '/* no exports */'),
    }
  }

  return result
}

/**
 * Snapshot a package by reading its package.json exports and parsing dist files.
 */
export function snapshotPackage(cwd: string, options?: ApiSnapshotOptions): SnapshotResult {
  const entries = resolvePackageEntries(cwd)
  return snapshotEntries(entries, cwd, options)
}

/**
 * Snapshot explicit file pairs.
 */
export function snapshotFiles(
  files: { name: string, runtime?: string, dts?: string }[],
  cwd: string,
  options?: ApiSnapshotOptions,
): SnapshotResult {
  const entries: ResolvedEntry[] = files.map(f => ({
    name: f.name,
    runtime: f.runtime ? resolve(cwd, f.runtime) : null,
    dts: f.dts ? resolve(cwd, f.dts) : null,
  }))
  return snapshotEntries(entries, cwd, options)
}

function snapshotEntries(
  entries: ResolvedEntry[],
  cwd: string,
  options?: ApiSnapshotOptions,
): SnapshotResult {
  const { outputDir, ext, update } = resolveOptions(options)
  const resolvedOutputDir = resolve(cwd, outputDir)
  const extractOptions = { omitArgumentNames: options?.omitArgumentNames }
  const showHeader = options?.header ?? true
  const packageName = showHeader ? readPackageName(cwd) : ''

  const mismatches: SnapshotResult['mismatches'] = []
  const allMismatchDetails: import('./snapshot.ts').SnapshotMismatch[] = []

  for (const entry of entries) {
    const stem = entryNameToStem(entry.name)

    const runtime = entry.runtime
      ? extractRuntime(entry.runtime, readFileSync(entry.runtime, 'utf-8'), extractOptions)
      : ''
    const dts = entry.dts
      ? extractDts(entry.dts, readFileSync(entry.dts, 'utf-8'), extractOptions)
      : ''

    const header = showHeader ? generateHeader(packageName, entry.name) : undefined
    const current = { runtime, dts }
    const existing = readSnapshot(resolvedOutputDir, stem, ext)

    if (!existing || update) {
      writeSnapshot(resolvedOutputDir, stem, current, ext, header)
    }
    else {
      const mismatch = compareSnapshots(stem, existing, current)
      if (mismatch) {
        mismatches.push({
          name: entry.name,
          runtimeChanged: !!mismatch.runtimeDiff,
          dtsChanged: !!mismatch.dtsDiff,
        })
        allMismatchDetails.push(mismatch)
        writeSnapshot(resolvedOutputDir, stem, current, ext, header)
      }
    }
  }

  const hasChanges = mismatches.length > 0
  const diffOutput = hasChanges
    ? formatMismatchError(allMismatchDetails, outputDir, ext)
    : null

  return { hasChanges, mismatches, diff: diffOutput }
}

/**
 * Convert export path to filesystem-safe stem.
 * '.' → 'index', './utils' → 'utils', './foo/bar' → 'foo/bar'
 */
const LEADING_DOT_SLASH_RE = /^\.\//

function entryNameToStem(name: string): string {
  if (name === '.' || name === './')
    return 'index'
  return name.replace(LEADING_DOT_SLASH_RE, '')
}
