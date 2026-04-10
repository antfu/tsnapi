import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'

/**
 * Extract runtime export skeletons from a JS chunk.
 * Returns a formatted `.ts` snapshot string showing the API surface without implementations.
 */
export function extractRuntime(fileName: string, code: string): string {
  const { program } = parseSync(fileName, code)
  const s = new MagicString(code)
  const entries: { name: string, text: string }[] = []

  // Build a map of top-level declarations for resolving export specifiers
  const declMap = new Map<string, any>()
  for (const stmt of program.body) {
    collectDeclarations(stmt as any, declMap)
  }

  for (const stmt of program.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      const decl = (stmt as any).declaration
      if (decl) {
        processDeclaration(s, decl, entries, 'export ')
      }
      else if ((stmt as any).specifiers?.length > 0) {
        const source = (stmt as any).source
        if (source) {
          // Re-export from another module: export { foo } from '...'
          const text = s.slice(stmt.start, stmt.end).trim()
          const firstName = (stmt as any).specifiers[0]?.exported?.name
            ?? (stmt as any).specifiers[0]?.local?.name ?? ''
          entries.push({ name: firstName, text })
        }
        else {
          // Local re-export: export { foo, bar }
          // Resolve each specifier to its declaration
          for (const spec of (stmt as any).specifiers) {
            const localName = spec.local?.name ?? ''
            const exportedName = spec.exported?.name ?? localName
            const decl = declMap.get(localName)
            if (decl) {
              const skeleton = extractDeclarationSkeleton(s, decl, exportedName)
              entries.push({ name: exportedName, text: `export ${skeleton}` })
            }
            else {
              entries.push({ name: exportedName, text: `export { ${localName === exportedName ? localName : `${localName} as ${exportedName}`} }` })
            }
          }
        }
      }
    }
    else if (stmt.type === 'ExportDefaultDeclaration') {
      const decl = (stmt as any).declaration
      if (decl?.type === 'FunctionDeclaration' || decl?.type === 'FunctionExpression') {
        const sig = extractFunctionSignature(s, decl)
        entries.push({ name: '\x00default', text: `export default ${sig}` })
      }
      else if (decl?.type === 'ClassDeclaration' || decl?.type === 'ClassExpression') {
        const skeleton = extractClassSkeleton(s, decl)
        entries.push({ name: '\x00default', text: `export default ${skeleton}` })
      }
      else {
        const text = s.slice(stmt.start, stmt.end).trim()
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
function extractDeclarationSkeleton(s: MagicString, decl: any, exportedName: string): string {
  if (decl.type === 'FunctionDeclaration') {
    return extractFunctionSignature(s, decl, exportedName)
  }
  if (decl.type === 'ClassDeclaration') {
    return extractClassSkeleton(s, decl, exportedName)
  }
  if (decl.type === 'VariableDeclaration') {
    const declarator = decl._declarator ?? decl.declarations?.[0]
    // Detect `var X = class { ... }` pattern
    const init = declarator?.init
    if (init?.type === 'ClassExpression' || init?.type === 'ClassDeclaration') {
      return extractClassSkeleton(s, init, exportedName)
    }
    // Detect `var X = function(...) { ... }` pattern
    if (init?.type === 'FunctionExpression') {
      return extractFunctionSignature(s, init, exportedName)
    }
    return extractVariableDeclaration(s, decl.kind, declarator, exportedName)
  }
  return exportedName
}

function processDeclaration(
  s: MagicString,
  decl: any,
  entries: { name: string, text: string }[],
  prefix: string,
): void {
  if (decl.type === 'FunctionDeclaration') {
    const name = decl.id?.name ?? 'anonymous'
    const sig = extractFunctionSignature(s, decl)
    entries.push({ name, text: `${prefix}${sig}` })
  }
  else if (decl.type === 'ClassDeclaration') {
    const name = decl.id?.name ?? 'anonymous'
    const skeleton = extractClassSkeleton(s, decl)
    entries.push({ name, text: `${prefix}${skeleton}` })
  }
  else if (decl.type === 'VariableDeclaration') {
    for (const declarator of decl.declarations ?? []) {
      const name = declarator.id?.name ?? ''
      const init = declarator.init
      // Detect `var/const X = class { ... }` pattern
      if (init?.type === 'ClassExpression' || init?.type === 'ClassDeclaration') {
        const skeleton = extractClassSkeleton(s, init, name)
        entries.push({ name, text: `${prefix}${skeleton}` })
      }
      // Detect `var/const X = function(...) { ... }` pattern
      else if (init?.type === 'FunctionExpression') {
        const sig = extractFunctionSignature(s, init, name)
        entries.push({ name, text: `${prefix}${sig}` })
      }
      else {
        const text = extractVariableDeclaration(s, decl.kind, declarator)
        entries.push({ name, text: `${prefix}${text}` })
      }
    }
  }
}

function extractFunctionSignature(_s: MagicString, decl: any, nameOverride?: string): string {
  const async = decl.async ? 'async ' : ''
  const generator = decl.generator ? '*' : ''
  const name = nameOverride ?? decl.id?.name ?? ''
  const params = extractParams(_s, decl.params)

  return `${async}function${generator ? `* ` : ' '}${name}(${params}) { /* ... */ }`
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

function extractClassSkeleton(s: MagicString, decl: any, nameOverride?: string): string {
  const name = nameOverride ?? decl.id?.name ?? ''
  const superClass = decl.superClass
    ? ` extends ${s.slice(decl.superClass.start, decl.superClass.end)}`
    : ''

  const members: string[] = []
  const body = decl.body

  if (body?.body) {
    for (const member of body.body) {
      if (member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') {
        const memberText = extractClassMember(s, member)
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

function extractClassMember(s: MagicString, member: any): string | null {
  const isStatic = member.static ? 'static ' : ''
  const accessibility = member.accessibility ? `${member.accessibility} ` : ''

  if (member.type === 'MethodDefinition') {
    const key = member.computed
      ? `[${s.slice(member.key.start, member.key.end)}]`
      : member.key?.name ?? s.slice(member.key.start, member.key.end)

    const value = member.value
    if (!value)
      return null

    const async = value.async ? 'async ' : ''
    const generator = value.generator ? '*' : ''
    const params = extractParams(s, value.params)

    if (member.kind === 'constructor') {
      return `${accessibility}constructor(${params}) { /* ... */ }`
    }
    if (member.kind === 'get') {
      return `${isStatic}${accessibility}get ${key}() { /* ... */ }`
    }
    if (member.kind === 'set') {
      return `${isStatic}${accessibility}set ${key}(${params}) { /* ... */ }`
    }

    return `${isStatic}${accessibility}${async}${generator}${key}(${params}) { /* ... */ }`
  }

  if (member.type === 'PropertyDefinition') {
    const key = member.computed
      ? `[${s.slice(member.key.start, member.key.end)}]`
      : member.key?.name ?? s.slice(member.key.start, member.key.end)

    return `${isStatic}${accessibility}${key}`
  }

  return null
}

function extractVariableDeclaration(_s: MagicString, kind: string, declarator: any, nameOverride?: string): string {
  const name = nameOverride ?? declarator.id?.name ?? _s.slice(declarator.id.start, declarator.id.end)
  // Use `var name /* const */` to keep output valid JS while preserving the original kind
  if (kind === 'const' || kind === 'let') {
    return `var ${name} /* ${kind} */`
  }
  return `var ${name}`
}
