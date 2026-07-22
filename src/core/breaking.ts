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
 *
 * The classification is intentionally lossy — it errs towards *not* flagging a
 * change so routine updates aren't blocked by additive tweaks. It reliably
 * catches removals (of whole exports or of parts of a declaration) but treats
 * anything that only *adds* to a declaration (new interface members, wider
 * union types, extra parameters) as safe.
 */
export interface BreakingChange {
  /** Entry name / stem the change belongs to (e.g. `index`, `utils`). */
  entryName: string
  /** Exports that existed before but are now gone. Always breaking. */
  removed: string[]
  /**
   * Exports that still exist but whose declaration changed in a way that
   * removed something (a member, parameter, union arm, etc.). Breaking.
   */
  modified: string[]
  /**
   * Exports whose declaration only grew (new interface members, wider unions,
   * extra parameters). Additive — not breaking.
   */
  widened: string[]
  /** Newly introduced exports. Additive — never breaking on its own. */
  added: string[]
}

/**
 * Whether a change classification represents a breaking change,
 * i.e. an existing export was removed or narrowed. Pure additions and
 * widenings are not breaking.
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
  // Bare (non-exported) declarations appear in the snapshot's
  // `Referenced (internal)` region. They're part of the captured contract, so
  // track them too — a removed member of an internal type is still breaking.
  return bareDeclarationNames(stmt)
}

/**
 * The names introduced by a non-exported top-level declaration (as emitted
 * into the `Referenced (internal)` snapshot region).
 */
function bareDeclarationNames(stmt: any): string[] {
  if (stmt.type === 'VariableDeclaration') {
    return (stmt.declarations ?? [])
      .map((d: any) => d.id?.name)
      .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
  }
  if (
    stmt.type === 'TSInterfaceDeclaration'
    || stmt.type === 'TSTypeAliasDeclaration'
    || stmt.type === 'TSEnumDeclaration'
    || stmt.type === 'ClassDeclaration'
    || stmt.type === 'TSDeclareFunction'
    || stmt.type === 'FunctionDeclaration'
    || stmt.type === 'TSModuleDeclaration'
  ) {
    return typeof stmt.id?.name === 'string' && stmt.id.name.length > 0 ? [stmt.id.name] : []
  }
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

// Words, string/template/regex-ish literals, numbers, or any single
// non-whitespace character (punctuation). Multi-char operators split into
// single chars, which is fine — comparison only cares about the multiset.
const TOKEN_RE = /[A-Z_$][\w$]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\d[\w.]*|\S/gi

/**
 * Tokenize a declaration into a multiset of tokens (token -> count).
 */
function tokenMultiset(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tok of text.match(TOKEN_RE) ?? [])
    counts.set(tok, (counts.get(tok) ?? 0) + 1)
  return counts
}

/**
 * Whether `next` contains every token of `prev` at least as many times, i.e.
 * the declaration only grew. A pure widening (new members, wider unions, extra
 * parameters) is a superset; a removal/narrowing drops a token below its old
 * count.
 */
function isWidening(prev: string, next: string): boolean {
  const prevCounts = tokenMultiset(prev)
  const nextCounts = tokenMultiset(next)
  for (const [tok, n] of prevCounts) {
    if ((nextCounts.get(tok) ?? 0) < n)
      return false
  }
  return true
}

type Classification = 'unchanged' | 'widened' | 'breaking'

/**
 * Classify a member present in both snapshots by comparing each surface.
 * Breaking if any surface was removed or narrowed; otherwise widened if any
 * surface only grew; otherwise unchanged.
 */
function classifyModification(prev: Member, next: Member): Classification {
  let changed = false
  for (const surface of ['runtime', 'dts'] as const) {
    const before = prev[surface] ?? ''
    const after = next[surface] ?? ''
    if (before === after)
      continue
    changed = true
    // A whole surface disappeared (e.g. lost its type declaration): breaking.
    if (before && !after)
      return 'breaking'
    // A whole new surface appeared: additive.
    if (!before && after)
      continue
    // Both present but different: breaking unless it only grew.
    if (!isWidening(before, after))
      return 'breaking'
  }
  return changed ? 'widened' : 'unchanged'
}

/**
 * Classify how the public API changed between an existing snapshot and a
 * freshly generated one.
 *
 * A member is:
 * - **removed** if it was present before and is now absent (breaking),
 * - **modified** if it is present in both but its declaration lost something —
 *   a member, parameter, or union arm (breaking),
 * - **widened** if its declaration only grew — new members, wider unions,
 *   extra parameters (additive),
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
  const widened: string[] = []
  const added: string[] = []

  for (const [name, member] of oldMembers) {
    const next = newMembers.get(name)
    if (!next) {
      removed.push(name)
      continue
    }
    const cls = classifyModification(member, next)
    if (cls === 'breaking')
      modified.push(name)
    else if (cls === 'widened')
      widened.push(name)
  }
  for (const name of newMembers.keys()) {
    if (!oldMembers.has(name))
      added.push(name)
  }

  removed.sort()
  modified.sort()
  widened.sort()
  added.sort()

  return { entryName, removed, modified, widened, added }
}

// ANSI helpers for the surrounding message.
const bold = (s: string): string => `\x1B[1m${s}\x1B[22m`
const red = (s: string): string => `\x1B[31m${s}\x1B[39m`
const yellow = (s: string): string => `\x1B[33m${s}\x1B[39m`
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
      lines.push(red(`    - removed   ${stripDefault(name)}`))
    for (const name of change.modified)
      lines.push(yellow(`    ~ narrowed  ${stripDefault(name)}`))
    lines.push('')
  }

  lines.push(dim('  Refusing to update snapshots because the public API changed in a breaking way.'))
  lines.push(dim('  If this is intentional, re-run with --allow-breaking (or set TSNAPI_ALLOW_BREAKING=1).'))
  lines.push('')

  return lines.join('\n')
}
