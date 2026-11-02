import type { Entry, EntryKind } from './kind.ts'
import { posix } from 'node:path'
import MagicString from 'magic-string'
import { parse } from 'oxc-parser'
import { formatGroupedEntries } from './kind.ts'

/**
 * Look up a chunk's source by its import path.
 *
 * Chunk sources are keyed relative to the dist root (e.g. `./engine-x.mjs`), but an
 * entry emitted in a subdirectory imports them with a `../` prefix (`../engine-x.mjs`),
 * so the literal lookup misses. Fall back to matching by basename, which is unambiguous
 * since chunk filenames are content-hashed and unique. Without this, re-exported
 * declarations from shared chunks collapse to a bare `export { name }` with no signature.
 *
 * Only relative sources are considered: bare specifiers point at real packages, never
 * at chunks, and must not be matched by basename.
 */
export function resolveChunkSource(chunkSources: Map<string, string>, source: string): string | undefined {
  return lookupChunk(chunkSources, source)?.code
}

/**
 * Like {@link resolveChunkSource}, but also returns the key the chunk was found under,
 * so imports inside that chunk can be resolved relative to its location.
 */
export function lookupChunk(chunkSources: Map<string, string>, source: string): { key: string, code: string } | undefined {
  if (!source.startsWith('.'))
    return undefined
  const direct = chunkSources.get(source)
  if (direct !== undefined)
    return { key: source, code: direct }
  const base = source.split('/').pop()
  for (const [key, value] of chunkSources) {
    if (key.split('/').pop() === base)
      return { key, code: value }
  }
  return undefined
}

/** A binding imported from (or re-exported through) another module. */
export interface ChunkImport {
  source: string
  imported: string
}

/** Maximum number of chunk-to-chunk hops followed when resolving a binding. */
export const MAX_CHUNK_DEPTH = 8

/**
 * Resolve `source`, as written inside the chunk stored under `fromKey`, to a key in
 * the same `./`/`../`-relative space as the chunk source map.
 */
export function joinChunkSource(fromKey: string, source: string): string {
  if (!source.startsWith('.'))
    return source
  const joined = posix.join(posix.dirname(fromKey), source)
  return joined.startsWith('.')
    ? joined
    : `./${joined}`
}

/**
 * Map every local binding introduced by an `import` statement to its source and
 * imported name.
 */
export function collectImportBindings(program: any): Map<string, ChunkImport> {
  const importMap = new Map<string, ChunkImport>()
  for (const stmt of program.body) {
    if (stmt.type !== 'ImportDeclaration' || !stmt.source)
      continue
    const source = stmt.source.value as string
    for (const spec of stmt.specifiers ?? []) {
      if (spec.type === 'ImportSpecifier') {
        importMap.set(getExportName(spec.local), {
          source,
          imported: getExportName(spec.imported),
        })
      }
      else if (spec.type === 'ImportDefaultSpecifier') {
        importMap.set(getExportName(spec.local), { source, imported: 'default' })
      }
    }
  }
  return importMap
}

/**
 * Whether an `export { ... } from '<source>'` statement points into a known chunk,
 * in which case its specifiers are resolved like `import` + local `export { ... }`
 * (rolldown >= 1.2.13 emits `export { t as foo } from "./chunk.mjs"` for entries).
 * Re-exports from real packages stay as raw re-export entries.
 */
export function isChunkReExport(stmt: any, chunkSources?: Map<string, string>): boolean {
  return !!(stmt.source && chunkSources && lookupChunk(chunkSources, stmt.source.value) !== undefined)
}

/**
 * Pick a readable name for a chunk binding that couldn't be resolved: chunk exports
 * are mangled (`t`, `n`, ...), so prefer a public name the same statement exports it as.
 */
export function readableChunkLocal(stmt: any, localName: string): string {
  for (const spec of stmt.specifiers ?? []) {
    const exported = getExportName(spec.exported)
    if (getExportName(spec.local) === localName && exported && exported !== 'default')
      return exported
  }
  return localName
}

/**
 * When a chunk doesn't declare `importedName` itself but forwards it from another
 * module (`export { x as t } from './other.mjs'`, or `import { x } from './other.mjs'`
 * followed by `export { x as t }`), return where to continue looking. The returned
 * source is joined against `chunkKey` so it can be looked up in the chunk map.
 */
export function findChunkForward(program: any, importedName: string, chunkKey: string): ChunkImport | undefined {
  let imports: Map<string, ChunkImport> | undefined
  for (const stmt of program.body) {
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration)
      continue
    for (const spec of stmt.specifiers ?? []) {
      if (getExportName(spec.exported) !== importedName)
        continue
      const local = getExportName(spec.local)
      if (stmt.source) {
        return {
          source: joinChunkSource(chunkKey, stmt.source.value),
          imported: local,
        }
      }
      imports ??= collectImportBindings(program)
      const imported = imports.get(local)
      if (imported) {
        return {
          source: joinChunkSource(chunkKey, imported.source),
          imported: imported.imported,
        }
      }
      return undefined
    }
  }
  return undefined
}

/**
 * Get the name from a ModuleExportName node (Identifier or StringLiteral).
 */
function getExportName(node: any): string {
  return node?.name ?? node?.value ?? ''
}

/**
 * Format a resolved declaration as an export entry.
 * Handles `default` specially since `export function default()` is invalid syntax.
 */
const RE_DEFAULT_WORD = /\bdefault\b/

function formatExportEntry(exportedName: string, skeleton: string, kind: EntryKind): Entry {
  if (exportedName === 'default') {
    const renamed = skeleton.replace(RE_DEFAULT_WORD, '_default')
    return { name: '\x00default', text: `${renamed}\nexport default _default`, kind: 'default' }
  }
  return { name: exportedName, text: `export ${skeleton}`, kind }
}

function kindFromRuntimeDecl(decl: any): EntryKind {
  if (decl.type === 'FunctionDeclaration')
    return 'function'
  if (decl.type === 'ClassDeclaration')
    return 'class'
  if (decl.type === 'VariableDeclaration') {
    const init = (decl._declarator ?? decl.declarations?.[0])?.init
    if (init?.type === 'ClassExpression' || init?.type === 'ClassDeclaration')
      return 'class'
    if (init?.type === 'FunctionExpression')
      return 'function'
    return 'variable'
  }
  return 'other'
}

export interface ExtractOptions {
  chunkSources?: Map<string, string>
  omitArgumentNames?: boolean
  typeWidening?: boolean
  categorizedExports?: boolean
  referenceTracingDepth?: number
  /** Transform the extracted entries before serialization; mutate in place or return a replacement array. */
  transformEntries?: (entries: Entry[]) => Entry[] | null | void
}

/** Minimal marker prepended above declarations that carry an `@deprecated` tag. */
export const DEPRECATED_MARKER = '/** @deprecated */\n'
const RE_DEPRECATED = /@deprecated\b/

/**
 * Collect the start offsets of top-level statements that have an immediately
 * preceding `@deprecated` comment. The full JSDoc is dropped like any other
 * comment — only a minimal marker is surfaced in the snapshot.
 */
export function collectDeprecatedStarts(program: any, comments: any[], code: string): Set<number> {
  const starts = new Set<number>()
  const depComments = comments.filter(c => RE_DEPRECATED.test(c.value))
  if (depComments.length === 0)
    return starts
  for (const stmt of program.body) {
    for (const c of depComments) {
      if (c.end <= stmt.start && code.slice(c.end, stmt.start).trim() === '') {
        starts.add(stmt.start)
        break
      }
    }
  }
  return starts
}

/** Prepend the `@deprecated` marker to every entry pushed since `fromIdx`. */
export function applyDeprecated(entries: Entry[], fromIdx: number): void {
  for (let i = fromIdx; i < entries.length; i++) {
    if (!entries[i].text.startsWith(DEPRECATED_MARKER))
      entries[i] = { ...entries[i], text: DEPRECATED_MARKER + entries[i].text }
  }
}

/**
 * Extract runtime export skeletons from a JS chunk.
 * Returns a formatted `.ts` snapshot string showing the API surface without implementations.
 */
export async function extractRuntime(fileName: string, code: string, options?: ExtractOptions): Promise<string> {
  const chunkSources = options?.chunkSources
  const omitArgs = options?.omitArgumentNames ?? true
  const typeWidening = options?.typeWidening ?? true
  const categorized = options?.categorizedExports ?? true
  const { program, comments } = await parse(fileName, code)
  const s = new MagicString(code)
  const entries: Entry[] = []
  const deprecatedStarts = collectDeprecatedStarts(program, comments, code)

  // Build a map of top-level declarations for resolving export specifiers
  const declMap = new Map<string, any>()
  for (const stmt of program.body) {
    collectDeclarations(stmt as any, declMap)
  }

  // Track imports for resolving re-exports through chunks
  const importMap = chunkSources
    ? collectImportBindings(program)
    : new Map<string, ChunkImport>()

  for (const stmt of program.body) {
    const entriesBefore = entries.length
    if (stmt.type === 'ExportNamedDeclaration') {
      const decl = (stmt as any).declaration
      if (decl) {
        processDeclaration(s, decl, entries, 'export ', omitArgs, typeWidening)
      }
      else if ((stmt as any).specifiers?.length > 0) {
        const source = (stmt as any).source
        const fromChunk = isChunkReExport(stmt, chunkSources)
        if (source && !fromChunk) {
          // Re-export from another module: export { foo } from '...'
          const text = s.slice(stmt.start, stmt.end).trim()
          const firstName = getExportName((stmt as any).specifiers[0]?.exported)
            || getExportName((stmt as any).specifiers[0]?.local)
          entries.push({ name: firstName, text, kind: 're-export' })
        }
        else {
          // Local re-export: export { foo, bar }, or a re-export from a chunk:
          // export { t as foo } from './chunk.mjs'
          // Resolve each specifier to its declaration
          for (const spec of (stmt as any).specifiers) {
            const localName = getExportName(spec.local)
            const exportedName = getExportName(spec.exported) || localName
            const decl = fromChunk
              ? undefined
              : declMap.get(localName)
            if (decl) {
              const kind = kindFromRuntimeDecl(decl)
              const skeleton = extractDeclarationSkeleton(s, decl, exportedName, omitArgs, typeWidening)
              entries.push(formatExportEntry(exportedName, skeleton, kind))
              if (deprecatedStarts.has(decl.start))
                applyDeprecated(entries, entries.length - 1)
            }
            else {
              // Try resolving through imports into chunk files
              const importInfo = fromChunk
                ? { source: source.value as string, imported: localName }
                : importMap.get(localName)
              const resolved = importInfo && await resolveFromChunkRuntime(importInfo, exportedName, chunkSources, omitArgs, typeWidening)
              if (resolved) {
                entries.push(resolved)
              }
              else {
                const fallbackName = fromChunk
                  ? readableChunkLocal(stmt, localName)
                  : localName
                if (exportedName === 'default') {
                  entries.push({ name: '\x00default', text: `export default ${fallbackName}`, kind: 'default' })
                }
                else {
                  entries.push({ name: exportedName, text: `export { ${fallbackName === exportedName
                    ? fallbackName
                    : `${fallbackName} as ${exportedName}`} }`, kind: 'other' })
                }
              }
            }
          }
        }
      }
    }
    else if (stmt.type === 'ExportDefaultDeclaration') {
      const decl = (stmt as any).declaration
      if (decl?.type === 'FunctionDeclaration' || decl?.type === 'FunctionExpression') {
        const sig = extractFunctionSignature(s, decl, undefined, omitArgs)
        entries.push({ name: '\x00default', text: `export default ${sig}`, kind: 'default' })
      }
      else if (decl?.type === 'ClassDeclaration' || decl?.type === 'ClassExpression') {
        const skeleton = extractClassSkeleton(s, decl, undefined, omitArgs)
        entries.push({ name: '\x00default', text: `export default ${skeleton}`, kind: 'default' })
      }
      else {
        const text = s.slice(stmt.start, stmt.end).trim()
        entries.push({ name: '\x00default', text, kind: 'default' })
      }
    }
    else if (stmt.type === 'ExportAllDeclaration') {
      const text = s.slice(stmt.start, stmt.end).trim()
      entries.push({ name: `\x00*${(stmt as any).source?.value ?? ''}`, text, kind: 're-export' })
    }
    if (deprecatedStarts.has(stmt.start))
      applyDeprecated(entries, entriesBefore)
  }

  const finalEntries = options?.transformEntries?.(entries) ?? entries
  if (categorized) {
    return formatGroupedEntries(finalEntries)
  }
  finalEntries.sort((a, b) => a.name.localeCompare(b.name))
  return `${finalEntries.map(e => e.text).join('\n')}\n`
}

/**
 * Resolve an import binding through a chunk file to get the expanded declaration.
 * Follows chunk-to-chunk forwarding up to {@link MAX_CHUNK_DEPTH} hops.
 */
async function resolveFromChunkRuntime(
  importInfo: ChunkImport,
  exportedName: string,
  chunkSources?: Map<string, string>,
  omitArgs = true,
  typeWidening = true,
  depth = 0,
): Promise<Entry | undefined> {
  if (!chunkSources || depth > MAX_CHUNK_DEPTH)
    return undefined
  const chunk = lookupChunk(chunkSources, importInfo.source)
  if (!chunk)
    return undefined

  const { program } = await parse(chunk.key, chunk.code)
  const chunkS = new MagicString(chunk.code)
  const chunkDeclMap = new Map<string, any>()
  for (const stmt of program.body) {
    collectDeclarations(stmt as any, chunkDeclMap)
  }

  // Find the local declaration name for the chunk's exported name
  const chunkLocalName = resolveChunkExportLocal(program, importInfo.imported, chunkDeclMap)
  const decl = chunkLocalName
    ? chunkDeclMap.get(chunkLocalName)
    : undefined
  if (!decl) {
    // The chunk may forward the binding from yet another chunk
    const forward = findChunkForward(program, importInfo.imported, chunk.key)
    return forward && resolveFromChunkRuntime(forward, exportedName, chunkSources, omitArgs, typeWidening, depth + 1)
  }

  const kind = kindFromRuntimeDecl(decl)
  const skeleton = extractDeclarationSkeleton(chunkS, decl, exportedName, omitArgs, typeWidening)
  return formatExportEntry(exportedName, skeleton, kind)
}

/**
 * Given a chunk's exported name, find the local declaration name.
 * For `export { foo as bar }`, if importedName is 'bar', returns 'foo'.
 * For `export function foo()`, if importedName is 'foo', returns 'foo'.
 */
function resolveChunkExportLocal(
  program: any,
  importedName: string,
  declMap: Map<string, any>,
): string | undefined {
  for (const stmt of program.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      // Check export specifiers: export { foo as bar }
      if (stmt.specifiers) {
        for (const spec of stmt.specifiers) {
          if (getExportName(spec.exported) === importedName) {
            return getExportName(spec.local)
          }
        }
      }
      // Check direct export declarations: export function foo()
      const decl = stmt.declaration
      if (decl) {
        if (decl.id?.name === importedName)
          return importedName
        if (decl.type === 'VariableDeclaration') {
          for (const declarator of decl.declarations ?? []) {
            if (declarator.id?.name === importedName)
              return importedName
          }
        }
      }
    }
    else if (stmt.type === 'ExportDefaultDeclaration' && importedName === 'default') {
      const decl = stmt.declaration
      if (decl?.id?.name && declMap.has(decl.id.name))
        return decl.id.name
    }
  }
  return undefined
}

/**
 * Collect top-level declarations into a name -> AST node map.
 */
function collectDeclarations(stmt: any, map: Map<string, any>): void {
  if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
    map.set(stmt.id.name, stmt)
  }
  else if (stmt.type === 'ClassDeclaration' && stmt.id?.name) {
    map.set(stmt.id.name, stmt)
  }
  else if (stmt.type === 'VariableDeclaration') {
    for (const declarator of stmt.declarations ?? []) {
      if (declarator.id?.name) {
        map.set(declarator.id.name, { ...stmt, _declarator: declarator })
      }
    }
  }
  // Also handle exported declarations
  else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
    collectDeclarations(stmt.declaration, map)
  }
}

/**
 * Extract a skeleton from a declaration, optionally renaming it.
 */
function extractDeclarationSkeleton(s: MagicString, decl: any, exportedName: string, omitArgs = true, typeWidening = true): string {
  if (decl.type === 'FunctionDeclaration') {
    return extractFunctionSignature(s, decl, exportedName, omitArgs)
  }
  if (decl.type === 'ClassDeclaration') {
    return extractClassSkeleton(s, decl, exportedName, omitArgs)
  }
  if (decl.type === 'VariableDeclaration') {
    const declarator = decl._declarator ?? decl.declarations?.[0]
    // Detect `var X = class { ... }` pattern
    const init = declarator?.init
    if (init?.type === 'ClassExpression' || init?.type === 'ClassDeclaration') {
      return extractClassSkeleton(s, init, exportedName, omitArgs)
    }
    // Detect `var X = function(...) { ... }` pattern
    if (init?.type === 'FunctionExpression') {
      return extractFunctionSignature(s, init, exportedName, omitArgs)
    }
    return extractVariableDeclaration(s, decl.kind, declarator, exportedName, typeWidening)
  }
  return exportedName
}

function processDeclaration(
  s: MagicString,
  decl: any,
  entries: Entry[],
  prefix: string,
  omitArgs = true,
  typeWidening = true,
): void {
  if (decl.type === 'FunctionDeclaration') {
    const name = decl.id?.name ?? 'anonymous'
    const sig = extractFunctionSignature(s, decl, undefined, omitArgs)
    entries.push({ name, text: `${prefix}${sig}`, kind: 'function' })
  }
  else if (decl.type === 'ClassDeclaration') {
    const name = decl.id?.name ?? 'anonymous'
    const skeleton = extractClassSkeleton(s, decl, undefined, omitArgs)
    entries.push({ name, text: `${prefix}${skeleton}`, kind: 'class' })
  }
  else if (decl.type === 'VariableDeclaration') {
    for (const declarator of decl.declarations ?? []) {
      const name = declarator.id?.name ?? ''
      const init = declarator.init
      // Detect `var/const X = class { ... }` pattern
      if (init?.type === 'ClassExpression' || init?.type === 'ClassDeclaration') {
        const skeleton = extractClassSkeleton(s, init, name, omitArgs)
        entries.push({ name, text: `${prefix}${skeleton}`, kind: 'class' })
      }
      // Detect `var/const X = function(...) { ... }` pattern
      else if (init?.type === 'FunctionExpression') {
        const sig = extractFunctionSignature(s, init, name, omitArgs)
        entries.push({ name, text: `${prefix}${sig}`, kind: 'function' })
      }
      else {
        const text = extractVariableDeclaration(s, decl.kind, declarator, undefined, typeWidening)
        entries.push({ name, text: `${prefix}${text}`, kind: 'variable' })
      }
    }
  }
}

function extractFunctionSignature(_s: MagicString, decl: any, nameOverride?: string, omitArgs = true): string {
  const async = decl.async ? 'async ' : ''
  const generator = decl.generator ? '*' : ''
  const name = nameOverride ?? decl.id?.name ?? ''
  const params = omitArgs
    ? anonymizeParams(decl.params)
    : extractParams(_s, decl.params)

  const body = '{}'
  return `${async}function${generator
    ? `* `
    : ' '}${name}(${params}) ${body}`
}

/**
 * Replace all parameter names with `_`, preserving rest elements.
 */
function anonymizeParams(params: any): string {
  if (!params || !Array.isArray(params) || params.length === 0)
    return ''
  return params.map((p: any) => {
    if (p?.type === 'RestElement')
      return '..._'
    return '_'
  }).join(', ')
}

function extractParams(s: MagicString, params: any): string {
  if (!params || !Array.isArray(params) || params.length === 0)
    return ''
  const parts: string[] = []

  for (const param of params) {
    parts.push(extractParamText(s, param))
  }

  return parts.join(', ')
}

function extractParamText(s: MagicString, param: any): string {
  if (!param)
    return ''

  if (param.type === 'RestElement') {
    return `...${extractParamText(s, param.argument)}`
  }

  if (param.type === 'AssignmentPattern') {
    return extractParamText(s, param.left)
  }

  if (param.type === 'Identifier') {
    return param.name ?? '_'
  }

  if (param.type === 'ObjectPattern' || param.type === 'ArrayPattern') {
    return s.slice(param.start, param.end).replace(/\s*=[^,)]+/g, '')
  }

  return s.slice(param.start, param.end)
}

function extractClassSkeleton(s: MagicString, decl: any, nameOverride?: string, omitArgs = true): string {
  const name = nameOverride ?? decl.id?.name ?? ''
  const superClass = decl.superClass
    ? ` extends ${s.slice(decl.superClass.start, decl.superClass.end)}`
    : ''

  const members: string[] = []
  const body = decl.body

  if (body?.body) {
    for (const member of body.body) {
      if (member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') {
        const memberText = extractClassMember(s, member, omitArgs)
        if (memberText)
          members.push(memberText)
      }
    }
  }

  if (members.length === 0) {
    return `class ${name}${superClass} {}`
  }

  const indent = '  '
  const bodyText = members.map(m => `${indent}${m}`).join('\n')
  return `class ${name}${superClass} {\n${bodyText}\n}`
}

function extractClassMember(s: MagicString, member: any, omitArgs = true): string | null {
  const isStatic = member.static ? 'static ' : ''
  const accessibility = member.accessibility
    ? `${member.accessibility} `
    : ''

  if (member.type === 'MethodDefinition') {
    const key = member.computed
      ? `[${s.slice(member.key.start, member.key.end)}]`
      : member.key?.name ?? s.slice(member.key.start, member.key.end)

    const value = member.value
    if (!value)
      return null

    const async = value.async ? 'async ' : ''
    const generator = value.generator ? '*' : ''
    const params = omitArgs
      ? anonymizeParams(value.params)
      : extractParams(s, value.params)

    if (member.kind === 'constructor') {
      return `${accessibility}constructor(${params}) {}`
    }
    if (member.kind === 'get') {
      return `${isStatic}${accessibility}get ${key}() {}`
    }
    if (member.kind === 'set') {
      return `${isStatic}${accessibility}set ${key}(${params}) {}`
    }

    return `${isStatic}${accessibility}${async}${generator}${key}(${params}) {}`
  }

  if (member.type === 'PropertyDefinition') {
    const key = member.computed
      ? `[${s.slice(member.key.start, member.key.end)}]`
      : member.key?.name ?? s.slice(member.key.start, member.key.end)

    return `${isStatic}${accessibility}${key}`
  }

  return null
}

function isPreservableLiteral(init: any): boolean {
  if (!init)
    return false
  if (init.type === 'Literal')
    return true
  if (init.type === 'TemplateLiteral' && (!init.expressions || init.expressions.length === 0))
    return true
  if (init.type === 'UnaryExpression' && init.operator === '-' && init.argument?.type === 'Literal')
    return true
  if (init.type === 'ArrayExpression')
    return (init.elements ?? []).every((el: any) => el && isPreservableLiteral(el))
  if (init.type === 'ObjectExpression' && (!init.properties || init.properties.length === 0))
    return true
  return false
}

function extractVariableDeclaration(_s: MagicString, kind: string, declarator: any, nameOverride?: string, typeWidening = true): string {
  const name = nameOverride ?? declarator.id?.name ?? _s.slice(declarator.id.start, declarator.id.end)

  if (!typeWidening && declarator.init && isPreservableLiteral(declarator.init)) {
    const initText = _s.slice(declarator.init.start, declarator.init.end)
    if (kind === 'const' || kind === 'let') {
      return `var ${name} = ${initText} /* ${kind} */`
    }
    return `var ${name} = ${initText}`
  }

  // Use `var name /* const */` to keep output valid JS while preserving the original kind
  if (kind === 'const' || kind === 'let') {
    return `var ${name} /* ${kind} */`
  }
  return `var ${name}`
}
