import type { ApiSnapshotOptions } from './core/types.ts'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { globSync } from 'tinyglobby'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateApiSnapshot } from './core/index.ts'
import { resolvePackageEntriesSync } from './core/resolve.ts'

export interface SnapshotApiOptions extends Pick<ApiSnapshotOptions, 'omitArgumentNames' | 'header'> {
  /**
   * Snapshot output directory, relative to the test file.
   * @default '__snapshots__/tsnapi'
   */
  outputDir?: string
}

export interface PackageContext {
  cwd: string
  workspaceRoot: string
  packageRoot: string
  packageName: string
  /** Snapshot output directory, relative to the test file. Defaults from options or `'__snapshots__/tsnapi'`. */
  outputDir: string
}

export interface DescribePackagesApiSnapshotsOptions extends SnapshotApiOptions {
  /**
   * Package directories as absolute paths.
   * When omitted, auto-discovers from pnpm-workspace.yaml or package.json workspaces.
   */
  packages?: string[]
  /**
   * Working directory for workspace discovery.
   * @default process.cwd()
   */
  cwd?: string
  /**
   * Called for each discovered package.
   * Mutate `ctx` to customize the describe block name, snapshot output directory, etc.
   * Return `false` to skip the package entirely.
   * @example
   * ```ts
   * filter(ctx) {
   *   // Strip org scope from describe name
   *   ctx.packageName = ctx.packageName.replace(/^@.*\//, '')
   * }
   * ```
   */
  filter?: (ctx: PackageContext) => boolean | void
  /**
   * Hook called inside each package's `describe` block via Vitest's `beforeEach`.
   * Receives the (possibly mutated) package context.
   */
  beforeEach?: (ctx: PackageContext) => void | Promise<void>
  /**
   * Hook called inside each package's `describe` block via Vitest's `afterEach`.
   * Receives the (possibly mutated) package context.
   */
  afterEach?: (ctx: PackageContext) => void | Promise<void>
}

/**
 * Create `it()` blocks for each entry point of a package,
 * asserting runtime and DTS snapshots via `toMatchFileSnapshot`.
 *
 * Entry names are resolved from `package.json` at registration time
 * using synchronous I/O (vitest's `describe` does not support async callbacks).
 * Dist files are read lazily inside each `it()` block,
 * so `beforeAll` hooks can build the package first.
 */
export function snapshotApiPerEntry(cwd: string, options?: SnapshotApiOptions): void {
  const outputDir = options?.outputDir ?? '__snapshots__/tsnapi'
  const pkgName = readPackageName(cwd) ?? 'unknown'
  const entries = resolvePackageEntriesSync(cwd)

  if (entries.length === 0) {
    it.skip('no exports', () => {})
    return
  }

  let _api: Record<string, { runtime: string, dts: string }> | undefined
  async function getApi(): Promise<Record<string, { runtime: string, dts: string }>> {
    return _api ??= await generateApiSnapshot(cwd, options)
  }

  for (const entry of entries) {
    const stem = entry.name === '.' ? 'index' : entry.name.replace(/^\.\//, '')

    it(`runtime: ${entry.name}`, async () => {
      const snapshot = (await getApi())[entry.name]
      await expect(snapshot.runtime)
        .toMatchFileSnapshot(join(outputDir, pkgName, `${stem}.snapshot.js`))
    })

    it(`dts: ${entry.name}`, async () => {
      const snapshot = (await getApi())[entry.name]
      await expect(snapshot.dts)
        .toMatchFileSnapshot(join(outputDir, pkgName, `${stem}.snapshot.d.ts`))
    })
  }
}

/**
 * Create `describe()` blocks for each package in a monorepo,
 * each containing `snapshotApiPerEntry`.
 *
 * Auto-discovers packages from `pnpm-workspace.yaml` or `package.json` workspaces
 * when `packages` is omitted.
 */
export function describePackagesApiSnapshots(options?: DescribePackagesApiSnapshotsOptions): void {
  const cwd = options?.cwd ?? process.cwd()
  const dirs = options?.packages ?? resolveWorkspacePackages(cwd)
  const defaultOutputDir = options?.outputDir ?? '__snapshots__/tsnapi'

  for (const dir of dirs) {
    const pkgName = readPackageName(dir) ?? dir
    const ctx: PackageContext = { cwd, workspaceRoot: cwd, packageRoot: dir, packageName: pkgName, outputDir: defaultOutputDir }

    if (options?.filter) {
      if (options.filter(ctx) === false)
        continue
    }

    describe(ctx.packageName, () => {
      if (options?.beforeEach)
        beforeEach(() => options.beforeEach!(ctx))
      if (options?.afterEach)
        afterEach(() => options.afterEach!(ctx))
      snapshotApiPerEntry(dir, { ...options, outputDir: ctx.outputDir })
    })
  }
}

function readPackageName(cwd: string): string | undefined {
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

function resolveWorkspacePackages(cwd: string): string[] {
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

function readWorkspacePatterns(cwd: string): string[] {
  // Try pnpm-workspace.yaml first
  const pnpmPath = join(cwd, 'pnpm-workspace.yaml')
  if (existsSync(pnpmPath)) {
    const content = readFileSync(pnpmPath, 'utf-8')
    return parsePnpmWorkspaceYaml(content)
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

function parsePnpmWorkspaceYaml(content: string): string[] {
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
