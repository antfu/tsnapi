import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { globSync } from 'tinyglobby'

/**
 * Read the `name` field from a package's `package.json`, or `undefined` when
 * the file is missing or unparseable.
 */
export function readPackageName(cwd: string): string | undefined {
  const pkgPath = join(cwd, 'package.json')
  try {
    if (!existsSync(pkgPath))
      return undefined
    return JSON.parse(readFileSync(pkgPath, 'utf-8')).name
  }
  catch {
    return undefined
  }
}

/**
 * Resolve the workspace package directories for a monorepo rooted at `cwd`.
 *
 * Auto-discovers from `pnpm-workspace.yaml` or `package.json` `workspaces`,
 * expanding the glob patterns and keeping only directories that contain a
 * `package.json`. Throws when no workspace patterns are declared — callers that
 * want a graceful single-package fallback should use {@link discoverPackages}.
 */
export function resolveWorkspacePackages(cwd: string): string[] {
  const patterns = readWorkspacePatterns(cwd)
  if (!patterns.length)
    throw new Error(`No workspace patterns found in ${cwd}. Provide \`packages\` explicitly or add pnpm-workspace.yaml / package.json workspaces.`)

  const dirs: string[] = []
  for (const pattern of patterns) {
    const matches = globSync(pattern, { cwd, onlyDirectories: true })
    for (const match of matches) {
      const abs = resolve(cwd, match)
      if (existsSync(join(abs, 'package.json')))
        dirs.push(abs)
    }
  }

  return dirs.sort()
}

/**
 * Discover every package to inspect under `cwd`.
 *
 * Unlike {@link resolveWorkspacePackages}, this never throws: a repo with no
 * workspace patterns is treated as a single package (just `cwd`, when it has a
 * `package.json`). Returns absolute directory paths, sorted.
 */
export function discoverPackages(cwd: string): string[] {
  const patterns = readWorkspacePatterns(cwd)
  if (patterns.length) {
    const dirs = resolveWorkspacePackages(cwd)
    if (dirs.length)
      return dirs
  }
  // Single-package repo (or an empty workspace): fall back to cwd itself.
  return existsSync(join(cwd, 'package.json')) ? [resolve(cwd)] : []
}

/**
 * Read the raw workspace glob patterns from `pnpm-workspace.yaml` (preferred)
 * or the `workspaces` field of `package.json`. Returns `[]` when neither
 * declares any.
 */
export function readWorkspacePatterns(cwd: string): string[] {
  // Try pnpm-workspace.yaml first
  const pnpmPath = join(cwd, 'pnpm-workspace.yaml')
  if (existsSync(pnpmPath)) {
    const content = readFileSync(pnpmPath, 'utf-8')
    const patterns = parsePnpmWorkspaceYaml(content)
    if (patterns.length)
      return patterns
  }

  // Fall back to package.json workspaces
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages
      if (Array.isArray(workspaces))
        return workspaces
    }
    catch {}
  }

  return []
}

/**
 * Extract the `packages:` glob list from `pnpm-workspace.yaml` content.
 * A deliberately tiny parser — it only understands the one field tsnapi needs.
 */
export function parsePnpmWorkspaceYaml(content: string): string[] {
  const patterns: string[] = []
  let inPackages = false

  for (const line of content.split('\n')) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages) {
      if (/^\S/.test(line))
        break // new top-level key
      const trimmed = line.replace(/^\s*-\s*/, '').trim()
      if (trimmed) {
        // Strip surrounding quotes
        patterns.push(trimmed.replace(/^['"]|['"]$/g, ''))
      }
    }
  }

  return patterns
}
