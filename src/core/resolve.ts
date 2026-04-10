import type { ResolvedEntry } from './types.ts'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const DTS_RE = /\.d\.[cm]?ts$/
const JS_RE = /\.[cm]?[jt]sx?$/

/**
 * Resolve package.json exports field into runtime + DTS file pairs.
 */
export function resolvePackageEntries(cwd: string): ResolvedEntry[] {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath))
    throw new Error(`No package.json found at ${cwd}`)

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const entries: ResolvedEntry[] = []

  if (pkg.exports) {
    resolveExportsField(pkg.exports, cwd, entries)
  }
  else {
    // Fallback to main/module/types
    const runtime = pkg.module || pkg.main
    const dts = pkg.types || pkg.typings
    if (runtime || dts) {
      entries.push({
        name: '.',
        runtime: runtime ? resolve(cwd, runtime) : null,
        dts: dts ? resolve(cwd, dts) : null,
      })
    }
  }

  return entries
}

/**
 * Resolve the root directory of an installed package.
 */
export function resolvePackageDir(name: string, cwd: string): string {
  // Try common node_modules locations
  const candidates = [
    join(cwd, 'node_modules', name),
    // pnpm nested structure
    join(cwd, 'node_modules', '.pnpm', `${name}@*`, 'node_modules', name),
  ]

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'package.json')))
      return candidate
  }

  // Use Node's resolution
  try {
    const pkgJsonPath = require.resolve(`${name}/package.json`, { paths: [cwd] })
    return dirname(pkgJsonPath)
  }
  catch {
    throw new Error(`Cannot find package "${name}" from ${cwd}`)
  }
}

function resolveExportsField(
  exports: any,
  cwd: string,
  entries: ResolvedEntry[],
  prefix = '.',
): void {
  // String shorthand: "exports": "./dist/index.mjs"
  if (typeof exports === 'string') {
    const resolved = resolve(cwd, exports)
    if (DTS_RE.test(exports)) {
      entries.push({ name: prefix, runtime: null, dts: resolved })
    }
    else {
      entries.push({ name: prefix, runtime: resolved, dts: null })
    }
    return
  }

  if (typeof exports !== 'object' || exports === null)
    return

  // Check if this is a conditions object (has keys like "import", "require", "types")
  const keys = Object.keys(exports)
  const isConditions = keys.some(k => ['import', 'require', 'default', 'types', 'module-sync'].includes(k))

  if (isConditions) {
    const runtime = resolveConditionValue(exports, ['import', 'module-sync', 'default', 'require'])
    const dts = resolveConditionValue(exports, ['types'])

    entries.push({
      name: prefix,
      runtime: runtime ? resolve(cwd, runtime) : null,
      dts: dts ? resolve(cwd, dts) : null,
    })
    return
  }

  // Subpath exports: { ".": ..., "./utils": ... }
  for (const [key, value] of Object.entries(exports)) {
    if (key === './package.json')
      continue
    // Skip wildcard patterns
    if (key.includes('*'))
      continue

    const subpath = key.startsWith('.') ? key : `./${key}`
    resolveExportsField(value, cwd, entries, subpath)
  }
}

function resolveConditionValue(obj: any, conditions: string[]): string | null {
  for (const cond of conditions) {
    const val = obj[cond]
    if (typeof val === 'string' && JS_RE.test(val))
      return val
    if (typeof val === 'object' && val !== null) {
      // Nested conditions, e.g. { import: { types: "...", default: "..." } }
      const nested = resolveConditionValue(val, ['default', 'import', 'require'])
      if (nested)
        return nested
    }
  }
  return null
}
