import type { SnapshotExtensions } from './snapshot.ts'
import type { ApiSnapshotOptions, ResolvedEntry, SnapshotResult } from './types.ts'
import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { hasArgvFlag } from './argv.ts'
import { analyzeApiChanges, formatBreakingChanges, isBreakingChange } from './breaking.ts'
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

export type { BreakingChange } from './breaking.ts'
export { analyzeApiChanges, formatBreakingChanges, isBreakingChange } from './breaking.ts'
export { extractDts } from './extract-dts.ts'
export { extractRuntime } from './extract-runtime.ts'
export { resolvePackageEntries, resolvePackageEntriesSync } from './resolve.ts'
export type { SnapshotExtensions, SnapshotFile, SnapshotMismatch } from './snapshot.ts'
export { compareSnapshots, formatMismatchError, generateHeader, readSnapshot, stripHeader, writeSnapshot } from './snapshot.ts'
export type { ApiSnapshotOptions, ResolvedEntry, SnapshotResult } from './types.ts'

async function readPackageName(cwd: string): Promise<string> {
  const pkgPath = join(cwd, 'package.json')
  try {
    await access(pkgPath)
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    if (pkg.name)
      return pkg.name
  }
  catch {}
  return 'unknown'
}

function resolveOptions(options?: ApiSnapshotOptions): {
  outputDir: string
  ext: SnapshotExtensions
  update: boolean
  allowBreaking: boolean
} {
  const outputDir = options?.outputDir ?? '__snapshots__/tsnapi'
  const ext: SnapshotExtensions = {
    runtime: options?.extensionRuntime ?? '.snapshot.js',
    dts: options?.extensionDts ?? '.snapshot.d.ts',
  }
  const update = resolveUpdateMode(options?.update)
  const allowBreaking = resolveAllowBreaking(options?.allowBreaking)
  return { outputDir, ext, update, allowBreaking }
}

export function resolveUpdateMode(explicit?: boolean): boolean {
  if (explicit != null)
    return explicit
  const env = process.env.UPDATE_SNAPSHOT
  if (env === '1' || env === 'true')
    return true
  return hasArgvFlag(process.argv.slice(2), '--update-snapshot', '-u')
}

/**
 * Resolve whether breaking API changes are allowed when updating snapshots.
 * When not set explicitly, auto-detected from the `--allow-breaking` CLI flag
 * or the `TSNAPI_ALLOW_BREAKING=1` environment variable.
 */
export function resolveAllowBreaking(explicit?: boolean): boolean {
  if (explicit != null)
    return explicit
  const env = process.env.TSNAPI_ALLOW_BREAKING
  if (env === '1' || env === 'true')
    return true
  return hasArgvFlag(process.argv.slice(2), '--allow-breaking')
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
export async function generateApiSnapshot(cwd: string, options?: ApiSnapshotOptions): Promise<Record<string, { runtime: string, dts: string }>> {
  const entries = await resolvePackageEntries(cwd)
  const result: Record<string, { runtime: string, dts: string }> = {}
  const extractOptions = { omitArgumentNames: options?.omitArgumentNames, typeWidening: options?.typeWidening, categorizedExports: options?.categorizedExports }
  const showHeader = options?.header ?? true
  const packageName = showHeader ? await readPackageName(cwd) : ''

  for (const entry of entries) {
    const runtime = entry.runtime
      ? await extractRuntime(entry.runtime, await readFile(entry.runtime, 'utf-8'), extractOptions)
      : ''
    const dts = entry.dts
      ? await extractDts(entry.dts, await readFile(entry.dts, 'utf-8'), extractOptions)
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
export async function snapshotPackage(cwd: string, options?: ApiSnapshotOptions): Promise<SnapshotResult> {
  const entries = await resolvePackageEntries(cwd)
  return snapshotEntries(entries, cwd, options)
}

/**
 * Snapshot explicit file pairs.
 */
export async function snapshotFiles(
  files: { name: string, runtime?: string, dts?: string }[],
  cwd: string,
  options?: ApiSnapshotOptions,
): Promise<SnapshotResult> {
  const entries: ResolvedEntry[] = files.map(f => ({
    name: f.name,
    runtime: f.runtime ? resolve(cwd, f.runtime) : null,
    dts: f.dts ? resolve(cwd, f.dts) : null,
  }))
  return snapshotEntries(entries, cwd, options)
}

async function snapshotEntries(
  entries: ResolvedEntry[],
  cwd: string,
  options?: ApiSnapshotOptions,
): Promise<SnapshotResult> {
  const { outputDir, ext, update, allowBreaking } = resolveOptions(options)
  const resolvedOutputDir = resolve(cwd, outputDir)
  const extractOptions = { omitArgumentNames: options?.omitArgumentNames, typeWidening: options?.typeWidening, categorizedExports: options?.categorizedExports }
  const showHeader = options?.header ?? true
  const packageName = showHeader ? await readPackageName(cwd) : ''

  const mismatches: SnapshotResult['mismatches'] = []
  const allMismatchDetails: import('./snapshot.ts').SnapshotMismatch[] = []
  const breaking: SnapshotResult['breaking'] = []

  for (const entry of entries) {
    const stem = entryNameToStem(entry.name)

    const runtime = entry.runtime
      ? await extractRuntime(entry.runtime, await readFile(entry.runtime, 'utf-8'), extractOptions)
      : ''
    const dts = entry.dts
      ? await extractDts(entry.dts, await readFile(entry.dts, 'utf-8'), extractOptions)
      : ''

    const header = showHeader ? generateHeader(packageName, entry.name) : undefined
    const current = { runtime, dts }
    const existing = await readSnapshot(resolvedOutputDir, stem, ext)

    if (!existing) {
      // First run: nothing to compare against, always write.
      await writeSnapshot(resolvedOutputDir, stem, current, ext, header)
    }
    else if (update) {
      // Guard the update: refuse to overwrite on a breaking change unless allowed.
      if (!allowBreaking) {
        const change = await analyzeApiChanges(stem, existing, current)
        if (isBreakingChange(change)) {
          breaking.push(change)
          continue
        }
      }
      await writeSnapshot(resolvedOutputDir, stem, current, ext, header)
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
        await writeSnapshot(resolvedOutputDir, stem, current, ext, header)
      }
    }
  }

  const hasChanges = mismatches.length > 0 || breaking.length > 0
  const diffOutput = breaking.length > 0
    ? formatBreakingChanges(breaking)
    : mismatches.length > 0
      ? formatMismatchError(allMismatchDetails, outputDir, ext)
      : null

  return { hasChanges, mismatches, diff: diffOutput, breaking }
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
