import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'

/**
 * Extract type declaration skeletons from a DTS chunk.
 * Returns a formatted `.d.ts` snapshot string.
 */
export function extractDts(fileName: string, code: string): string {
  // Strip comments
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  const { program } = parseSync(fileName, stripped)
  const s = new MagicString(stripped)
  const entries: { name: string, text: string }[] = []

  // Build a map of top-level declarations (including non-exported ones)
  // for resolving export { ... } specifiers
  const declMap = new Map<string, { stmt: any, decl: any }>()
  for (const stmt of program.body) {
    collectDtsDeclarations(stmt as any, declMap)
  }

  for (const stmt of program.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      processExportNamedDeclaration(stmt as any, s, entries, declMap)
    }
    else if (stmt.type === 'ExportDefaultDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      if (text) {
        entries.push({ name: '\x00default', text })
      }
    }
    else if (stmt.type === 'ExportAllDeclaration') {
      const text = s.slice(stmt.start, stmt.end).trim()
      entries.push({ name: `\x00*${(stmt as any).source?.value ?? ''}`, text })
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))

  return `${entries.map(e => e.text).join('\n')}\n`
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
  entries: { name: string, text: string }[],
  declMap: Map<string, { stmt: any, decl: any }>,
): void {
  const decl = stmt.declaration
  if (decl) {
    if (decl.type === 'TSInterfaceDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      entries.push({ name: decl.id?.name ?? '', text })
    }
    else if (decl.type === 'TSTypeAliasDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      entries.push({ name: decl.id?.name ?? '', text })
    }
    else if (decl.type === 'TSEnumDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      entries.push({ name: decl.id?.name ?? '', text })
    }
    else if (decl.type === 'TSDeclareFunction') {
      const name = decl.id?.name ?? ''
      const text = extractTSDeclareFunction(s, stmt, decl)
      entries.push({ name, text })
    }
    else if (decl.type === 'FunctionDeclaration') {
      const name = decl.id?.name ?? ''
      const text = extractTSDeclareFunction(s, stmt, decl)
      entries.push({ name, text })
    }
    else if (decl.type === 'ClassDeclaration') {
      const text = normalizeWhitespace(s.slice(stmt.start, stmt.end))
      const name = decl.id?.name ?? ''
      entries.push({ name, text })
    }
    else if (decl.type === 'VariableDeclaration') {
      for (const declarator of decl.declarations ?? []) {
        const name = declarator.id?.name ?? ''
        const text = widenVariableDecl(s, decl, declarator, 'export ')
        entries.push({ name, text })
      }
    }
  }
  else if (stmt.specifiers && stmt.specifiers.length > 0) {
    // Handle `export { A, type B }` — resolve each specifier to its declaration
    for (const spec of stmt.specifiers) {
      const localName = spec.local?.name ?? ''
      const exportedName = spec.exported?.name ?? localName
      const isTypeExport = spec.exportKind === 'type'
        || s.slice(spec.start, spec.end).trimStart().startsWith('type ')

      const resolved = declMap.get(localName)
      if (resolved) {
        const text = extractResolvedDeclaration(s, resolved, exportedName, isTypeExport)
        entries.push({ name: exportedName, text })
      }
      else {
        // Fallback: just output the specifier
        entries.push({ name: exportedName, text: `export { ${localName === exportedName ? localName : `${localName} as ${exportedName}`} }` })
      }
    }
  }
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
): string {
  const { decl } = resolved

  if (decl.type === 'TSInterfaceDeclaration') {
    const body = s.slice(decl.start, decl.end)
    // Rename if needed
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    return normalizeWhitespace(`export ${text}`)
  }

  if (decl.type === 'TSTypeAliasDeclaration') {
    const body = s.slice(decl.start, decl.end)
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    return normalizeWhitespace(`export ${text}`)
  }

  if (decl.type === 'TSEnumDeclaration') {
    const body = s.slice(decl.start, decl.end)
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    return normalizeWhitespace(`export ${text}`)
  }

  if (decl.type === 'TSDeclareFunction' || decl.type === 'FunctionDeclaration') {
    const clone = new MagicString(s.original)
    const params = decl.params ?? []
    for (const param of params) {
      replaceParamNames(clone, param)
    }
    let text = clone.slice(decl.start, decl.end)
    if (exportedName !== (decl.id?.name ?? '')) {
      text = text.replace(decl.id.name, exportedName)
    }
    // Add `export` and ensure `declare` is present
    const prefix = text.trimStart().startsWith('declare') ? 'export ' : 'export declare '
    return normalizeWhitespace(`${prefix}${text.trimStart()}`)
  }

  if (decl.type === 'ClassDeclaration') {
    const body = s.slice(decl.start, decl.end)
    const text = exportedName !== (decl.id?.name ?? '')
      ? body.replace(decl.id.name, exportedName)
      : body
    const prefix = text.trimStart().startsWith('declare') ? 'export ' : 'export declare '
    return normalizeWhitespace(`${prefix}${text.trimStart()}`)
  }

  if (decl.type === 'VariableDeclaration') {
    const declarator = decl._declarator ?? decl.declarations?.[0]
    if (declarator) {
      return widenVariableDecl(s, decl, declarator, 'export ', exportedName)
    }
  }

  // Fallback
  if (isTypeExport) {
    return `export type { ${exportedName} }`
  }
  return `export { ${exportedName} }`
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
): string {
  // Replace parameter names with `_` but keep type annotations
  const clone = new MagicString(s.original)

  const params = decl.params ?? []
  for (const param of params) {
    replaceParamNames(clone, param)
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
