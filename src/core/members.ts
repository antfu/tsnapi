import type { EntryKind } from './kind.ts'
import type { SnapshotFile } from './snapshot.ts'
import { parse } from 'oxc-parser'
import { analyzeApiChanges } from './breaking.ts'
import { stripHeader } from './snapshot.ts'

/**
 * A single public export as it appears in a snapshot, keyed by its public name
 * and split across the runtime and DTS surfaces. `referenced` marks a member
 * that came from the `Referenced (internal)` region — a non-exported type
 * whose shape is still part of the captured contract.
 */
export interface Member {
  /** Canonical key used for diffing (matches `analyzeApiChanges`). */
  name: string
  /** Human-friendly label (`default`, `* from './x'`, or the export name). */
  display: string
  kind: EntryKind
  referenced: boolean
  runtime?: string
  dts?: string
  /** For a `re-export` member, the raw module specifier it re-exports from (e.g. `./utils`, `@scope/pkg-b`). */
  source?: string
}

/** How a member changed between two snapshots. */
export type DiffStatus = 'added' | 'removed' | 'modified' | 'widened' | 'unchanged'

/** A member paired with its diff classification and both sides' signatures. */
export interface DiffMember {
  name: string
  display: string
  kind: EntryKind
  referenced: boolean
  status: DiffStatus
  base?: { runtime?: string, dts?: string }
  current?: { runtime?: string, dts?: string }
  /** For a `re-export` member, the raw module specifier it re-exports from (e.g. `./utils`, `@scope/pkg-b`). */
  source?: string
}

function nameOf(node: any): string {
  return node?.name ?? node?.value ?? ''
}

function kindFromDeclType(declType: string): EntryKind {
  switch (declType) {
    case 'TSInterfaceDeclaration': return 'interface'
    case 'TSTypeAliasDeclaration': return 'type'
    case 'TSEnumDeclaration': return 'enum'
    case 'TSDeclareFunction':
    case 'FunctionDeclaration': return 'function'
    case 'ClassDeclaration': return 'class'
    case 'VariableDeclaration': return 'variable'
    case 'TSModuleDeclaration': return 'namespace'
    default: return 'other'
  }
}

/**
 * The public names a top-level statement introduces, paired with their kind
 * and whether they are exported (vs. a bare `Referenced (internal)` decl).
 * `source` is only ever set on `re-export` members (the module specifier
 * being re-exported from).
 */
function statementMembers(stmt: any): { name: string, kind: EntryKind, referenced: boolean, source?: string }[] {
  if (stmt.type === 'ExportNamedDeclaration') {
    if (stmt.declaration) {
      const decl = stmt.declaration
      const kind = kindFromDeclType(decl.type)
      if (decl.type === 'VariableDeclaration') {
        return (decl.declarations ?? [])
          .map((d: any) => d.id?.name)
          .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
          .map((name: string) => ({ name, kind, referenced: false }))
      }
      if (decl.id?.name)
        return [{ name: decl.id.name, kind, referenced: false }]
      return []
    }
    if (stmt.specifiers?.length) {
      const kind: EntryKind = stmt.source ? 're-export' : 'other'
      const source: string | undefined = stmt.source?.value
      return stmt.specifiers
        .map((spec: any) => nameOf(spec.exported) || nameOf(spec.local))
        .filter((n: string) => n.length > 0)
        .map((name: string) => ({ name, kind, referenced: false, source }))
    }
    return []
  }
  if (stmt.type === 'ExportDefaultDeclaration')
    return [{ name: 'default', kind: 'default', referenced: false }]
  if (stmt.type === 'ExportAllDeclaration') {
    const source: string | undefined = stmt.source?.value
    return [{ name: `*${source ?? ''}`, kind: 're-export', referenced: false, source }]
  }

  // Bare (non-exported) declaration — the `Referenced (internal)` region.
  const kind = kindFromDeclType(stmt.type)
  if (kind === 'other')
    return []
  if (stmt.type === 'VariableDeclaration') {
    return (stmt.declarations ?? [])
      .map((d: any) => d.id?.name)
      .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0)
      .map((name: string) => ({ name, kind, referenced: true }))
  }
  return typeof stmt.id?.name === 'string' && stmt.id.name.length > 0
    ? [{ name: stmt.id.name, kind, referenced: true }]
    : []
}

/** A friendly label for a canonical member name. */
export function displayName(name: string): string {
  if (name === 'default')
    return 'default'
  if (name.startsWith('*'))
    return `* from '${name.slice(1)}'`
  return name
}

async function parseSurface(fileName: string, code: string): Promise<Map<string, { kind: EntryKind, referenced: boolean, text: string, source?: string }>> {
  const map = new Map<string, { kind: EntryKind, referenced: boolean, text: string, source?: string }>()
  const source = stripHeader(code).trim()
  if (!source || source === '/* no exports */')
    return map

  const { program } = await parse(fileName, source)
  for (const stmt of program.body) {
    const members = statementMembers(stmt)
    if (members.length === 0)
      continue
    const text = source.slice(stmt.start, stmt.end).trim()
    for (const m of members)
      map.set(m.name, { kind: m.kind, referenced: m.referenced, text, source: m.source })
  }
  return map
}

/**
 * Parse a snapshot pair (runtime + DTS) into a flat list of structured
 * members, merging the two surfaces by public name.
 */
export async function parseMembers(file: SnapshotFile): Promise<Member[]> {
  const [runtime, dts] = await Promise.all([
    parseSurface('snapshot.js', file.runtime),
    parseSurface('snapshot.d.ts', file.dts),
  ])

  const members = new Map<string, Member>()
  const ensure = (name: string, kind: EntryKind, referenced: boolean, source?: string): Member => {
    let m = members.get(name)
    if (!m) {
      m = { name, display: displayName(name), kind, referenced }
      members.set(name, m)
    }
    // Prefer a concrete (non-`other`) kind if one surface knows better.
    if (m.kind === 'other' && kind !== 'other')
      m.kind = kind
    if (source && !m.source)
      m.source = source
    return m
  }

  for (const [name, info] of runtime)
    ensure(name, info.kind, info.referenced, info.source).runtime = info.text
  for (const [name, info] of dts)
    ensure(name, info.kind, info.referenced, info.source).dts = info.text

  return [...members.values()].sort((a, b) => a.display.localeCompare(b.display))
}

/**
 * Diff two snapshot pairs into a per-member classification, reusing
 * {@link analyzeApiChanges} so the UI colours agree with tsnapi's own
 * breaking-change logic. `entryName` is only used for the underlying analysis.
 */
export async function diffMembers(entryName: string, base: SnapshotFile, current: SnapshotFile): Promise<DiffMember[]> {
  const [baseMembers, currentMembers, change] = await Promise.all([
    parseMembers(base),
    parseMembers(current),
    analyzeApiChanges(entryName, base, current),
  ])

  const removed = new Set(change.removed)
  const modified = new Set(change.modified)
  const widened = new Set(change.widened)
  const added = new Set(change.added)

  const baseByName = new Map(baseMembers.map(m => [m.name, m]))
  const currentByName = new Map(currentMembers.map(m => [m.name, m]))
  const names = new Set<string>([...baseByName.keys(), ...currentByName.keys()])

  const out: DiffMember[] = []
  for (const name of names) {
    const b = baseByName.get(name)
    const c = currentByName.get(name)
    const ref = c ?? b! // at least one exists
    const status: DiffStatus = removed.has(name)
      ? 'removed'
      : added.has(name)
        ? 'added'
        : modified.has(name)
          ? 'modified'
          : widened.has(name)
            ? 'widened'
            : 'unchanged'

    out.push({
      name,
      display: ref.display,
      kind: ref.kind,
      referenced: ref.referenced,
      status,
      base: b ? { runtime: b.runtime, dts: b.dts } : undefined,
      current: c ? { runtime: c.runtime, dts: c.dts } : undefined,
      source: ref.source,
    })
  }

  return out.sort((a, b) => a.display.localeCompare(b.display))
}
