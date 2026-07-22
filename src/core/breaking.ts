import type { SnapshotFile } from './snapshot.ts'
import { parse } from 'oxc-parser'
import { stripHeader } from './snapshot.ts'

/**
 * A single exported member as it appears in a snapshot, keyed by its public
 * name and split across the runtime and DTS surfaces.
 */
interface Member {
  runtime?: string
  dts?: string
}

/**
 * The classification of how a snapshot's public API changed between the
 * existing (committed) snapshot and the freshly generated one.
 */
export interface BreakingChange {
  /** Entry name / stem the change belongs to (e.g. `index`, `utils`). */
  entryName: string
  /** Exports that existed before but are now gone. Always breaking. */
  removed: string[]
  /** Exports that still exist but whose declaration changed. Always breaking. */
  modified: string[]
  /** Newly introduced exports. Additive — never breaking on its own. */
  added: string[]
}

/**
 * Whether a change classification represents a breaking change,
 * i.e. an existing export was removed or its declaration was modified.
 * Pure additions are not breaking.
 */
export function isBreakingChange(change: BreakingChange): boolean {
  return change.removed.length > 0 || change.modified.length > 0
}

/**
 * Get the string name from a ModuleExportName node (Identifier or StringLiteral).
 */
function nameOf(node: any): string {
  return node?.name ?? node?.value ?? ''
}

/**
 * The public names a top-level statement introduces into the export surface.
 */
function exportedNames(stmt: any): string[] {
  if (stmt.type === 'ExportNamedDeclaration') {
    if (stmt.declaration) {
      const decl = stmt.declaration
      if (decl.type === 'VariableDeclaration') {
        return (decl.declarations ?? [])
          .map((d: any) => d.id?.name)
          .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
      }
      if (decl.id?.name)
        return [decl.id.name]
      return []
    }
    if (stmt.specifiers?.length) {
      return stmt.specifiers
        .map((spec: any) => nameOf(spec.exported) || nameOf(spec.local))
        .filter((n: string) => n.length > 0)
    }
    return []
  }
  if (stmt.type === 'ExportDefaultDeclaration')
    return ['default']
  if (stmt.type === 'ExportAllDeclaration')
    return [`*${stmt.source?.value ?? ''}`]
  return []
}

/**
 * Parse a snapshot surface (runtime or DTS) into a map of public export name
 * to the normalized text of the declaration that introduced it.
 *
 * Comments (the tsnapi header, `// #region` markers, `@deprecated` markers)
 * live outside statement ranges and are therefore naturally excluded, so only
 * the declaration itself participates in the comparison.
 */
async function parseSurface(fileName: string, code: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const source = stripHeader(code).trim()
  if (!source || source === '/* no exports */')
    return map

  const { program } = await parse(fileName, source)
  for (const stmt of program.body) {
    const names = exportedNames(stmt)
    if (names.length === 0)
      continue
    const text = source.slice(stmt.start, stmt.end).trim()
    for (const name of names)
      map.set(name, text)
  }
  return map
}

/**
 * Merge the runtime and DTS surface maps into a single member map keyed by
 * public export name.
 */
function mergeSurfaces(runtime: Map<string, string>, dts: Map<string, string>): Map<string, Member> {
  const members = new Map<string, Member>()
  for (const [name, text] of runtime)
    members.set(name, { ...members.get(name), runtime: text })
  for (const [name, text] of dts)
    members.set(name, { ...members.get(name), dts: text })
  return members
}

/**
 * Serialize a member for equality comparison across both surfaces.
 */
function memberKey(member: Member): string {
  return `${member.runtime ?? ''}\u0000${member.dts ?? ''}`
}

/**
 * Classify how the public API changed between an existing snapshot and a
 * freshly generated one.
 *
 * A member is:
 * - **removed** if it was present before and is now absent (breaking),
 * - **modified** if it is present in both but its declaration text differs (breaking),
 * - **added** if it is newly present (additive).
 */
export async function analyzeApiChanges(
  entryName: string,
  existing: SnapshotFile,
  current: SnapshotFile,
): Promise<BreakingChange> {
  const [oldRuntime, oldDts, newRuntime, newDts] = await Promise.all([
    parseSurface('snapshot.js', existing.runtime),
    parseSurface('snapshot.d.ts', existing.dts),
    parseSurface('snapshot.js', current.runtime),
    parseSurface('snapshot.d.ts', current.dts),
  ])

  const oldMembers = mergeSurfaces(oldRuntime, oldDts)
  const newMembers = mergeSurfaces(newRuntime, newDts)

  const removed: string[] = []
  const modified: string[] = []
  const added: string[] = []

  for (const [name, member] of oldMembers) {
    const next = newMembers.get(name)
    if (!next)
      removed.push(name)
    else if (memberKey(member) !== memberKey(next))
      modified.push(name)
  }
  for (const name of newMembers.keys()) {
    if (!oldMembers.has(name))
      added.push(name)
  }

  removed.sort()
  modified.sort()
  added.sort()

  return { entryName, removed, modified, added }
}

// ANSI helpers for the surrounding message.
const bold = (s: string): string => `\x1B[1m${s}\x1B[22m`
const red = (s: string): string => `\x1B[31m${s}\x1B[39m`
const yellow = (s: string): string => `\x1B[33m${s}\x1B[39m`
const green = (s: string): string => `\x1B[32m${s}\x1B[39m`
const dim = (s: string): string => `\x1B[2m${s}\x1B[22m`

const stripDefault = (name: string): string => name === 'default' ? 'default' : name.replace(/^\*/, '* from ')

/**
 * Format the breaking-change report for terminal output.
 */
export function formatBreakingChanges(changes: BreakingChange[]): string {
  const breaking = changes.filter(isBreakingChange)
  const lines: string[] = []

  lines.push('')
  lines.push(bold(red('Breaking API changes detected')))
  lines.push('')

  for (const change of breaking) {
    lines.push(bold(`  ${change.entryName}`))
    for (const name of change.removed)
      lines.push(red(`    - removed  ${stripDefault(name)}`))
    for (const name of change.modified)
      lines.push(yellow(`    ~ changed  ${stripDefault(name)}`))
    for (const name of change.added)
      lines.push(green(`    + added    ${stripDefault(name)}`))
    lines.push('')
  }

  lines.push(dim('  Refusing to update snapshots because the public API changed in a breaking way.'))
  lines.push(dim('  If this is intentional, re-run with --allow-breaking (or set TSNAPI_ALLOW_BREAKING=1).'))
  lines.push('')

  return lines.join('\n')
}
