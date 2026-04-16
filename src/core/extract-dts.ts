import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'

/**
 * Get the name from a ModuleExportName node (Identifier or StringLiteral).
 */
function getExportName(node: any): string {
  return node?.name ?? node?.value ?? ''
}

/**
 * Format a resolved declaration as an export entry.
 * Handles `default` specially since `export declare function default()` is invalid syntax.
 */
const RE_EXPORT_PREFIX = /^export\s+/
const RE_DEFAULT_WORD = /\bdefault\b/
const RE_MJS_EXT = /\.mjs$/

function formatDtsExportEntry(exportedName: string, text: string, kind: DtsEntryKind): DtsEntry {
  if (exportedName === 'default') {
    // Remove `export` prefix, rename `default` to `_default`, then add `export default _default`
    const withoutExport = text.replace(RE_EXPORT_PREFIX, '')
    const renamed = withoutExport.replace(RE_DEFAULT_WORD, '_default')
    return { name: '\x00default', text: `${renamed}\nexport default _default`, kind: 'default' }
  }
  return { name: exportedName, text, kind }
}

/**
 * Extract type declaration skeletons from a DTS chunk.
 * Returns a formatted `.d.ts` snapshot string.
 *
 * @param chunkSources - Map of chunk source paths to their code, for resolving import-reexport patterns
 */
type DtsEntryKind = 'interface' | 'type' | 'enum' | 'class' | 'function' | 'variable' | 'default' | 're-export' | 'other'

interface DtsEntry {
  name: string
  text: string
  kind: DtsEntryKind
}

/**
 * Derive the kind from a declaration AST node type.
 */
function kindFromDeclType(declType: string): DtsEntryKind {
  switch (declType) {
    case 'TSInterfaceDeclaration': return 'interface'
    case 'TSTypeAliasDeclaration': return 'type'
    case 'TSEnumDeclaration': return 'enum'
    case 'TSDeclareFunction':
    case 'FunctionDeclaration': return 'function'
    case 'ClassDeclaration': return 'class'
    case 'VariableDeclaration': return 'variable'
    default: return 'other'
  }
}

const KIND_ORDER: DtsEntryKind[] = ['interface', 'type', 'enum', 'class', 'function', 'variable', 'default', 're-export', 'other']
const KIND_LABELS: Record<DtsEntryKind, string> = {
  'interface': 'Interfaces',
  'type': 'Types',
  'enum': 'Enums',
  'class': 'Classes',
  'function': 'Functions',
  'variable': 'Variables',
  'default': 'Default Export',
  're-export': 'Re-exports',
  'other': 'Other',
}

function formatGroupedEntries(entries: DtsEntry[]): string {
  const groups = new Map<DtsEntryKind, DtsEntry[]>()
  for (const entry of entries) {
    const list = groups.get(entry.kind) ?? []
    list.push(entry)
    groups.set(entry.kind, list)
  }

  const sections: string[] = []
  for (const kind of KIND_ORDER) {
    const group = groups.get(kind)
    if (!group || group.length === 0)
      continue
    group.sort((a, b) => a.name.localeCompare(b.name))
    sections.push(`// ${KIND_LABELS[kind]}\n${group.map(e => e.text).join('\n')}`)
  }

  return `${sections.join('\n\n')}\n`
}

export function extractDts(fileName: string, code: string, options?: import('./extract-runtime.ts').ExtractOptions): string {
  const chunkSources = options?.chunkSources
  const omitArgs = options?.omitArgumentNames ?? true
  const typeWidening = options?.typeWidening ?? true
  const { program, comments } = parseSync(fileName, code)
  const s = new MagicString(code)
  for (const c of comments)
    s.remove(c.start, c.end)
  const entries: DtsEntry[] = []

  // Build a map of top-level declarations (including non-exported ones)
  // for resolving export { ... } specifiers
  const declMap = new Map<string, { stmt: any, decl: any }>()
  for (const stmt of program.body) {
    collectDtsDeclarations(stmt as any, declMap)
  }

  // Track imports for resolving re-exports through chunks
  const importMap = new Map<string, { source: string, imported: string }>()
  if (chunkSources) {
    for (const stmt of program.body) {
      if (stmt.type === 'ImportDeclaration' && (stmt as any).source) {
        const source = (stmt as any).source.value as string
        for (const spec of (stmt as any).specifiers ?? []) {
          if (spec.type === 'ImportSpecifier') {
            importMap.set(
              getExportName(spec.local),
              { source, imported: getExportName(spec.imported) },
            )
          }
          else if (spec.type === 'ImportDefaultSpecifier') {
            importMap.set(
              getExportName(spec.local),
              { source, imported: 'default' },
            )
          }
        }
      }
    }
  }

  for (const stmt of program.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      processExportNamedDeclaration(stmt as any, s, entries, declMap, importMap, chunkSources, omitArgs, typeWidening)
    }
    else if (stmt.type === 'ExportDefaultDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      if (text) {
        entries.push({ name: '\x00default', text, kind: 'default' })
      }
    }
    else if (stmt.type === 'ExportAllDeclaration') {
      const text = s.slice(stmt.start, stmt.end).trim()
      entries.push({ name: `\x00*${(stmt as any).source?.value ?? ''}`, text, kind: 're-export' })
    }
  }

  return formatGroupedEntries(entries)
}

/**
 * Collect all top-level declarations into a name -> node map,
 * including non-exported ones (for resolving `export { ... }` specifiers).
 */
function collectDtsDeclarations(stmt: any, map: Map<string, { stmt: any, decl: any }>): void {
  const decl = stmt.declaration ?? stmt
  if (decl.type === 'TSInterfaceDeclaration' && decl.id?.name) {
    map.set(decl.id.name, { stmt, decl })
  }
  else if (decl.type === 'TSTypeAliasDeclaration' && decl.id?.name) {
    map.set(decl.id.name, { stmt, decl })
  }
  else if (decl.type === 'TSEnumDeclaration' && decl.id?.name) {
    map.set(decl.id.name, { stmt, decl })
  }
  else if ((decl.type === 'TSDeclareFunction' || decl.type === 'FunctionDeclaration') && decl.id?.name) {
    map.set(decl.id.name, { stmt, decl })
  }
  else if (decl.type === 'ClassDeclaration' && decl.id?.name) {
    map.set(decl.id.name, { stmt, decl })
  }
  else if (decl.type === 'VariableDeclaration') {
    for (const declarator of decl.declarations ?? []) {
      if (declarator.id?.name) {
        map.set(declarator.id.name, { stmt, decl: { ...decl, _declarator: declarator } })
      }
    }
  }
}

function processExportNamedDeclaration(
  stmt: any,
  s: MagicString,
  entries: DtsEntry[],
  declMap: Map<string, { stmt: any, decl: any }>,
  importMap: Map<string, { source: string, imported: string }>,
  chunkSources?: Map<string, string>,
  omitArgs = true,
  typeWidening = true,
): void {
  const decl = stmt.declaration
  if (decl) {
    const kind = kindFromDeclType(decl.type)
    if (decl.type === 'TSInterfaceDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      entries.push({ name: decl.id?.name ?? '', text, kind })
    }
    else if (decl.type === 'TSTypeAliasDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      entries.push({ name: decl.id?.name ?? '', text, kind })
    }
    else if (decl.type === 'TSEnumDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      entries.push({ name: decl.id?.name ?? '', text, kind })
    }
    else if (decl.type === 'TSDeclareFunction') {
      const name = decl.id?.name ?? ''
      const text = extractTSDeclareFunction(s, stmt, decl, omitArgs)
      entries.push({ name, text, kind })
    }
    else if (decl.type === 'FunctionDeclaration') {
      const name = decl.id?.name ?? ''
      const text = extractTSDeclareFunction(s, stmt, decl, omitArgs)
      entries.push({ name, text, kind })
    }
    else if (decl.type === 'ClassDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      const name = decl.id?.name ?? ''
      entries.push({ name, text, kind })
    }
    else if (decl.type === 'VariableDeclaration') {
      for (const declarator of decl.declarations ?? []) {
        const name = declarator.id?.name ?? ''
        const text = widenVariableDecl(s, decl, declarator, 'export ', undefined, typeWidening)
        entries.push({ name, text, kind })
      }
    }
  }
  else if (stmt.specifiers && stmt.specifiers.length > 0) {
    if (stmt.source) {
      // Re-export from another module: export { foo } from '...'
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      const firstName = getExportName(stmt.specifiers[0]?.exported)
        || getExportName(stmt.specifiers[0]?.local)
      entries.push({ name: firstName, text, kind: 're-export' })
      return
    }
    // Handle `export { A, type B }` — resolve each specifier to its declaration
    for (const spec of stmt.specifiers) {
      const localName = getExportName(spec.local)
      const exportedName = getExportName(spec.exported) || localName
      const isTypeExport = spec.exportKind === 'type'
        || s.slice(spec.start, spec.end).trimStart().startsWith('type ')

      const resolved = declMap.get(localName)
      if (resolved) {
        const { text, kind } = extractResolvedDeclaration(s, resolved, exportedName, isTypeExport, omitArgs, typeWidening)
        entries.push(formatDtsExportEntry(exportedName, text, kind))
      }
      else {
        // Try resolving through imports into chunk files
        const chunkResolved = resolveFromChunkDts(localName, exportedName, isTypeExport, importMap, chunkSources, omitArgs, typeWidening)
        if (chunkResolved) {
          entries.push(chunkResolved)
        }
        else {
          // Fallback: just output the specifier
          if (exportedName === 'default') {
            entries.push({ name: '\x00default', text: `export default ${localName}`, kind: 'default' })
          }
          else {
            entries.push({ name: exportedName, text: `export { ${localName === exportedName ? localName : `${localName} as ${exportedName}`} }`, kind: 'other' })
          }
        }
      }
    }
  }
}

/**
 * Resolve an import binding through a chunk DTS file to get the expanded declaration.
 */
function resolveFromChunkDts(
  localName: string,
  exportedName: string,
  isTypeExport: boolean,
  importMap: Map<string, { source: string, imported: string }>,
  chunkSources?: Map<string, string>,
  omitArgs = true,
  typeWidening = true,
): DtsEntry | undefined {
  if (!chunkSources)
    return undefined
  const importInfo = importMap.get(localName)
  if (!importInfo)
    return undefined
  const chunkCode = chunkSources.get(importInfo.source)
  if (!chunkCode)
    return undefined

  // Use .d.mts extension for parsing since the code is TypeScript DTS
  // (import source paths may use .mjs but the actual chunk code is .d.mts)
  const parseFileName = importInfo.source.replace(RE_MJS_EXT, '.d.mts')
  const { program, comments: chunkComments } = parseSync(parseFileName, chunkCode)
  const chunkS = new MagicString(chunkCode)
  for (const c of chunkComments)
    chunkS.remove(c.start, c.end)
  const chunkDeclMap = new Map<string, { stmt: any, decl: any }>()
  for (const stmt of program.body) {
    collectDtsDeclarations(stmt as any, chunkDeclMap)
  }

  // Find the local declaration name for the chunk's exported name
  const chunkLocalName = resolveChunkExportLocalDts(program, importInfo.imported, chunkDeclMap)
  if (!chunkLocalName)
    return undefined

  const resolved = chunkDeclMap.get(chunkLocalName)
  if (!resolved)
    return undefined

  const { text, kind } = extractResolvedDeclaration(chunkS, resolved, exportedName, isTypeExport, omitArgs, typeWidening)
  return formatDtsExportEntry(exportedName, text, kind)
}

/**
 * Given a chunk's exported name, find the local declaration name.
 */
function resolveChunkExportLocalDts(
  program: any,
  importedName: string,
  declMap: Map<string, { stmt: any, decl: any }>,
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
      // Check direct export declarations
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
 * Extract a declaration that's referenced via `export { ... }` specifier,
 * adding the `export` prefix.
 */
function extractResolvedDeclaration(
  s: MagicString,
  resolved: { stmt: any, decl: any },
  exportedName: string,
  isTypeExport: boolean,
  omitArgs = true,
  typeWidening = true,
): { text: string, kind: DtsEntryKind } {
  const { decl } = resolved
  const kind = kindFromDeclType(decl.type)

  if (decl.type === 'TSInterfaceDeclaration') {
    const body = s.slice(decl.start, decl.end)
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    return { text: normalizeWhitespace(`export ${text}`), kind }
  }

  if (decl.type === 'TSTypeAliasDeclaration') {
    const body = s.slice(decl.start, decl.end)
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    return { text: normalizeWhitespace(`export ${text}`), kind }
  }

  if (decl.type === 'TSEnumDeclaration') {
    const body = s.slice(decl.start, decl.end)
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    return { text: normalizeWhitespace(`export ${text}`), kind }
  }

  if (decl.type === 'TSDeclareFunction' || decl.type === 'FunctionDeclaration') {
    const clone = new MagicString(s.original)
    if (omitArgs) {
      const params = decl.params ?? []
      for (const param of params) {
        replaceParamNames(clone, param)
      }
    }
    let text = clone.slice(decl.start, decl.end)
    if (exportedName !== (decl.id?.name ?? '')) {
      text = text.replace(decl.id.name, exportedName)
    }
    const prefix = text.trimStart().startsWith('declare') ? 'export ' : 'export declare '
    return { text: normalizeWhitespace(`${prefix}${text.trimStart()}`), kind }
  }

  if (decl.type === 'ClassDeclaration') {
    const body = s.slice(decl.start, decl.end)
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    const prefix = text.trimStart().startsWith('declare') ? 'export ' : 'export declare '
    return { text: normalizeWhitespace(`${prefix}${text.trimStart()}`), kind }
  }

  if (decl.type === 'VariableDeclaration') {
    const declarator = decl._declarator ?? decl.declarations?.[0]
    if (declarator) {
      return { text: widenVariableDecl(s, decl, declarator, 'export ', exportedName, typeWidening), kind }
    }
  }

  // Fallback
  if (isTypeExport) {
    return { text: `export type { ${exportedName} }`, kind: 'type' }
  }
  return { text: `export { ${exportedName} }`, kind: 'other' }
}

/**
 * Widen a variable declaration's literal initializer to its base type.
 * e.g., `const VERSION = "2.0.0"` → `const VERSION: string`
 */
function widenVariableDecl(
  s: MagicString,
  decl: any,
  declarator: any,
  prefix: string,
  nameOverride?: string,
  typeWidening = true,
): string {
  const name = nameOverride ?? declarator.id?.name ?? ''
  const kind = decl.kind ?? 'const'
  const declare = decl.declare ? 'declare ' : ''
  const hasTypeAnnotation = !!declarator.id?.typeAnnotation
  const init = declarator.init

  // If there's already a type annotation, use the original text as-is
  if (hasTypeAnnotation) {
    const idText = s.slice(declarator.id.start, declarator.id.end)
    const renamed = nameOverride && nameOverride !== (declarator.id?.name ?? '')
      ? idText.replace(declarator.id.name, nameOverride)
      : idText
    return normalizeWhitespace(`${prefix}${declare}${kind} ${renamed};`)
  }

  // When typeWidening is false, preserve the original initializer
  if (!typeWidening && init) {
    const initText = s.slice(init.start, init.end).trim()
    return normalizeWhitespace(`${prefix}${declare}${kind} ${name} = ${initText};`)
  }

  // Widen literal initializers to their base type
  if (init) {
    const widened = widenLiteral(init, s)
    if (widened) {
      return normalizeWhitespace(`${prefix}${declare}${kind} ${name}: ${widened};`)
    }
  }

  // Fallback: just the name
  return normalizeWhitespace(`${prefix}${declare}${kind} ${name};`)
}

/**
 * Map a literal AST node to its widened type string.
 */
function widenLiteral(init: any, s: MagicString): string | null {
  if (init.type === 'Literal') {
    if (typeof init.value === 'string')
      return 'string'
    if (typeof init.value === 'number')
      return 'number'
    if (typeof init.value === 'boolean')
      return 'boolean'
    if (init.value === null)
      return 'null'
    if (init.raw?.startsWith('/'))
      return 'RegExp'
    if (typeof init.value === 'bigint' || init.raw?.endsWith('n'))
      return 'bigint'
  }
  if (init.type === 'TemplateLiteral')
    return 'string'
  if (init.type === 'UnaryExpression' && init.operator === '-' && init.argument?.type === 'Literal') {
    return typeof init.argument.value === 'number' ? 'number' : 'bigint'
  }
  if (init.type === 'ArrayExpression')
    return `${widenArrayElements(init, s)}[]`
  if (init.type === 'ObjectExpression' && (!init.properties || init.properties.length === 0))
    return 'object'
  return null
}

function widenArrayElements(init: any, _s: MagicString): string {
  if (!init.elements || init.elements.length === 0)
    return 'unknown'
  const types = new Set<string>()
  for (const el of init.elements) {
    if (!el)
      continue
    const w = widenLiteral(el, _s)
    if (w)
      types.add(w)
    else return 'unknown'
  }
  if (types.size === 0)
    return 'unknown'
  if (types.size === 1)
    return [...types][0]
  return [...types].join(' | ')
}

function extractTSDeclareFunction(
  s: MagicString,
  stmt: any,
  decl: any,
  omitArgs = true,
): string {
  const clone = new MagicString(s.original)

  if (omitArgs) {
    // Replace parameter names with `_` but keep type annotations
    const params = decl.params ?? []
    for (const param of params) {
      replaceParamNames(clone, param)
    }
  }

  return normalizeWhitespace(clone.slice(stmt.start, stmt.end))
}

function replaceParamNames(s: MagicString, param: any): void {
  if (!param)
    return

  if (param.type === 'RestElement') {
    replaceParamNames(s, param.argument)
    return
  }

  if (param.type === 'AssignmentPattern') {
    replaceParamNames(s, param.left)
    return
  }

  if (param.type === 'Identifier' && param.name) {
    s.overwrite(param.start, param.start + param.name.length, '_')
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line !== '')
    .join('\n')
    .trim()
}
