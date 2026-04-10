import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { diff } from '@vitest/utils/diff'

export interface SnapshotFile {
  runtime: string
  dts: string
}

export interface SnapshotExtensions {
  runtime: string
  dts: string
}

/**
 * Write snapshot files for an entry point.
 */
export function writeSnapshot(
  outputDir: string,
  entryName: string,
  snapshot: SnapshotFile,
  ext: SnapshotExtensions,
): void {
  mkdirSync(outputDir, { recursive: true })

  const runtimePath = join(outputDir, `${entryName}${ext.runtime}`)
  const dtsPath = join(outputDir, `${entryName}${ext.dts}`)

  ensureDir(runtimePath)
  ensureDir(dtsPath)

  writeFileSync(runtimePath, snapshot.runtime, 'utf-8')
  writeFileSync(dtsPath, snapshot.dts, 'utf-8')
}

/**
 * Read existing snapshot files for an entry point.
 * Returns null if either file doesn't exist.
 */
export function readSnapshot(
  outputDir: string,
  entryName: string,
  ext: SnapshotExtensions,
): SnapshotFile | null {
  const runtimePath = join(outputDir, `${entryName}${ext.runtime}`)
  const dtsPath = join(outputDir, `${entryName}${ext.dts}`)

  if (!existsSync(runtimePath) || !existsSync(dtsPath)) {
    return null
  }

  return {
    runtime: readFileSync(runtimePath, 'utf-8'),
    dts: readFileSync(dtsPath, 'utf-8'),
  }
}

export interface SnapshotMismatch {
  entryName: string
  runtimeDiff: string | null
  dtsDiff: string | null
}

/**
 * Compare a new snapshot against an existing one.
 * Returns null if they match, or a mismatch with formatted diffs.
 */
export function compareSnapshots(
  entryName: string,
  existing: SnapshotFile,
  current: SnapshotFile,
): SnapshotMismatch | null {
  const runtimeDiff = existing.runtime !== current.runtime
    ? diff(existing.runtime, current.runtime, { expand: false, contextLines: 3 })
    : null
  const dtsDiff = existing.dts !== current.dts
    ? diff(existing.dts, current.dts, { expand: false, contextLines: 3 })
    : null

  if (!runtimeDiff && !dtsDiff) {
    return null
  }

  return {
    entryName,
    runtimeDiff: runtimeDiff ?? null,
    dtsDiff: dtsDiff ?? null,
  }
}

// ANSI helpers for the surrounding message (not the diff itself)
const bold = (s: string): string => `\x1B[1m${s}\x1B[22m`
const red = (s: string): string => `\x1B[31m${s}\x1B[39m`
const cyan = (s: string): string => `\x1B[36m${s}\x1B[39m`
const dim = (s: string): string => `\x1B[2m${s}\x1B[22m`

/**
 * Format the full mismatch error with pretty diffs for terminal output.
 */
export function formatMismatchError(
  mismatches: SnapshotMismatch[],
  outputDir: string,
  ext: SnapshotExtensions,
): string {
  const lines: string[] = []

  lines.push('')
  lines.push(bold(red('API snapshot mismatch detected')))
  lines.push('')

  for (const m of mismatches) {
    if (m.runtimeDiff) {
      lines.push(cyan(`  ${outputDir}/${m.entryName}${ext.runtime}`))
      lines.push('')
      lines.push(indent(m.runtimeDiff, '    '))
      lines.push('')
    }
    if (m.dtsDiff) {
      lines.push(cyan(`  ${outputDir}/${m.entryName}${ext.dts}`))
      lines.push('')
      lines.push(indent(m.dtsDiff, '    '))
      lines.push('')
    }
  }

  lines.push(dim('  Run with --update-snapshot or -u to update.'))
  lines.push('')

  return lines.join('\n')
}

function indent(text: string, prefix: string): string {
  return text.split('\n').map(line => `${prefix}${line}`).join('\n')
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
}
