import type { ResolvedEntry } from './types.ts'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DTS_RE = /\.d\.[cm]?ts$/
const JS_RE = /\.[cm]?[jt]sx?$/
const RUNTIME_CONDITIONS = ['import', 'module-sync', 'default', 'require'] as const

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
        dts: dts ? resolve(cwd, dts) : (runtime ? tryResolveDts(runtime, cwd) : null),
      })
    }
  }

  return entries
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
      entries.push({ name: prefix, runtime: resolved, dts: tryResolveDts(exports, cwd) })
    }
    return
  }

  if (typeof exports !== 'object' || exports === null)
    return

  // Check if this is a conditions object (has keys like "import", "require", "types")
  const keys = Object.keys(exports)
  const isConditions = keys.some(k => ['import', 'require', 'default', 'types', 'module-sync'].includes(k))

  if (isConditions) {
    const resolvedBranches = resolveConditionBranches(exports)
    for (const branch of resolvedBranches) {
      entries.push({
        name: prefix,
        runtime: branch.runtime ? resolve(cwd, branch.runtime) : null,
        dts: branch.dts ? resolve(cwd, branch.dts) : (branch.runtime ? tryResolveDts(branch.runtime, cwd) : null),
      })
    }
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

function findRuntime(obj: any): string | null {
  if (!obj || typeof obj !== 'object')
    return null

  for (const cond of RUNTIME_CONDITIONS) {
    const val = obj[cond]
    if (typeof val === 'string' && JS_RE.test(val))
      return val
    if (typeof val === 'object' && val !== null) {
      const nested = findRuntime(val)
      if (nested)
        return nested
    }
  }

  return null
}

function findTypes(obj: any): string | null {
  if (!obj || typeof obj !== 'object')
    return null

  if (typeof obj.types === 'string' && DTS_RE.test(obj.types))
    return obj.types

  for (const val of Object.values(obj)) {
    if (typeof val === 'object' && val !== null) {
      const nested = findTypes(val)
      if (nested)
        return nested
    }
  }

  return null
}

function resolveConditionBranches(
  obj: Record<string, any>,
): { runtime: string | null, dts: string | null }[] {
  const branches: { runtime: string | null, dts: string | null }[] = []
  const topLevelTypes = typeof obj.types === 'string' && DTS_RE.test(obj.types)
    ? obj.types
    : null
  for (const key of RUNTIME_CONDITIONS) {
    if (!(key in obj))
      continue

    const branch = obj[key]
    let runtime: string | null = null
    let dts: string | null = null
    if (typeof branch === 'string' && JS_RE.test(branch)) {
      runtime = branch
    }
    else {
      runtime = findRuntime(branch)
    }
    // { import: { default: ..., types: ... } }
    dts = findTypes(branch) ?? topLevelTypes
    if (!runtime)
      continue

    branches.push({ runtime, dts })
  }

  if (!branches.length) {
    const runtime = findRuntime(obj)
    const dts = findTypes(obj)
    branches.push({ runtime, dts })
  }
  return dedupeBranches(branches)
}

function tryResolveDts(runtimePath: string, cwd: string): string | null {
  const candidates: string[] = []
  if (runtimePath.endsWith('.mjs'))
    candidates.push(runtimePath.replace(/\.mjs$/, '.d.mts'))
  else if (runtimePath.endsWith('.cjs'))
    candidates.push(runtimePath.replace(/\.cjs$/, '.d.cts'))
  candidates.push(runtimePath.replace(/\.[cm]?[jt]sx?$/, '.d.ts'))

  for (const candidate of candidates) {
    const abs = resolve(cwd, candidate)
    if (existsSync(abs))
      return abs
  }
  return null
}

function dedupeBranches(
  branches: { runtime: string | null, dts: string | null }[],
): { runtime: string | null, dts: string | null }[] {
  const seen = new Set<string>()
  const deduped: { runtime: string | null, dts: string | null }[] = []

  for (const branch of branches) {
    const key = `${branch.runtime ?? ''}|${branch.dts ?? ''}`
    if (seen.has(key))
      continue
    seen.add(key)
    deduped.push(branch)
  }

  return deduped
}
