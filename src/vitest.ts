import type { ApiSnapshotOptions } from './core/types.ts'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { globSync } from 'tinyglobby'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyzeApiChanges, formatBreakingChanges, generateApiSnapshot, isBreakingChange, resolveAllowBreaking } from './core/index.ts'
import { resolvePackageEntriesSync } from './core/resolve.ts'

export interface SnapshotApiOptions extends Pick<ApiSnapshotOptions, 'omitArgumentNames' | 'header' | 'allowBreaking'> {
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
  const allowBreaking = resolveAllowBreaking(options?.allowBreaking)
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
      const file = join(outputDir, pkgName, `${stem}.snapshot.js`)
      await guardBreakingUpdate(stem, 'runtime', snapshot.runtime, file, allowBreaking)
      await expect(snapshot.runtime).toMatchFileSnapshot(file)
    })

    it(`dts: ${entry.name}`, async () => {
      const snapshot = (await getApi())[entry.name]
      const file = join(outputDir, pkgName, `${stem}.snapshot.d.ts`)
      await guardBreakingUpdate(stem, 'dts', snapshot.dts, file, allowBreaking)
      await expect(snapshot.dts).toMatchFileSnapshot(file)
    })
  }
}

/**
 * Guard a single snapshot surface against breaking API changes before it is
 * written, mirroring the CLI / rolldown breaking guard for Vitest.
 *
 * Throws (failing the test, so the caller never overwrites the file) when
 * `updating` is set and the change removes or narrows part of the public API,
 * unless `allowBreaking` is set. A no-op when not updating (any diff already
 * fails the test in compare mode), when breaking changes are allowed, or when
 * there is no existing snapshot to compare against (`existing` is `null`).
 *
 * Pure and Vitest-independent — the caller supplies whether Vitest is updating
 * and the existing on-disk content — so it can be reused when wiring a custom
 * snapshot flow.
 */
export async function guardBreakingSnapshot(options: {
  /** Entry name / stem the surface belongs to (e.g. `index`, `utils`). */
  entryName: string
  /** Which snapshot surface `current` / `existing` represent. */
  surface: 'runtime' | 'dts'
  /** Freshly generated snapshot content for the surface. */
  current: string
  /** Existing on-disk snapshot content, or `null` on a first run. */
  existing: string | null
  /** Whether Vitest is overwriting snapshots (`-u`); guard only runs when `true`. */
  updating: boolean
  /** Allow breaking changes through without throwing. */
  allowBreaking: boolean
}): Promise<void> {
  const { entryName, surface, current, existing, updating, allowBreaking } = options
  if (!updating || allowBreaking || existing == null)
    return

  const before = surface === 'runtime' ? { runtime: existing, dts: '' } : { runtime: '', dts: existing }
  const after = surface === 'runtime' ? { runtime: current, dts: '' } : { runtime: '', dts: current }
  const change = await analyzeApiChanges(entryName, before, after)
  if (isBreakingChange(change))
    throw new Error(formatBreakingChanges([change]))
}

/**
 * Read the existing snapshot from disk (if any) and delegate to
 * {@link guardBreakingSnapshot}. `toMatchFileSnapshot` overwrites its target
 * unconditionally in update mode (`-u`), which would silently bake in a
 * breaking API change; running this first keeps the CLI / rolldown guarantee.
 */
async function guardBreakingUpdate(
  entryName: string,
  surface: 'runtime' | 'dts',
  current: string,
  file: string,
  allowBreaking: boolean,
): Promise<void> {
  const testPath = expect.getState().testPath
  let existing: string | null = null
  if (testPath) {
    const existingPath = isAbsolute(file) ? file : resolve(dirname(testPath), file)
    if (existsSync(existingPath))
      existing = readFileSync(existingPath, 'utf-8')
  }
  await guardBreakingSnapshot({ entryName, surface, current, existing, updating: isUpdatingSnapshots(), allowBreaking })
}

/**
 * Whether Vitest is set to overwrite existing snapshots (`-u` / `--update`),
 * read from the snapshot state Vitest attaches to the matcher state at run time.
 */
function isUpdatingSnapshots(): boolean {
  const state = expect.getState() as { snapshotState?: { snapshotUpdateState?: string } }
  return state.snapshotState?.snapshotUpdateState === 'all'
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
