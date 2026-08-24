import type { DiffMember, DiffStatus, SnapshotFile } from '../../core/index.ts'
import type {
  EntryNode,
  MemberNode,
  PackageNode,
  PayloadRequest,
  ReExportTarget,
  RefsPayload,
  SideMeta,
  WorkspacePayload,
} from './types.ts'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import {
  diffMembers,
  discoverPackages,
  isPrivatePackage,
  parseMembers,
  readPackageName,
  readWorkspacePatterns,
  resolvePackageEntries,
} from '../../core/index.ts'
import { gitShowFile, isGitRepo, listCommits, listNamedRefs, repoRoot, resolveRef } from './git.ts'
import { WORKING_TREE } from './types.ts'

const EMPTY_COUNTS = (): Record<DiffStatus, number> => ({ added: 0, removed: 0, modified: 0, widened: 0, unchanged: 0 })

const LEADING_DOT_SLASH_RE = /^\.\//
function entryNameToStem(name: string): string {
  if (name === '.' || name === './')
    return 'index'
  return name.replace(LEADING_DOT_SLASH_RE, '')
}

/**
 * Common directory names for a monorepo's single, central Vitest test file
 * (the file that calls `describePackagesApiSnapshots()`), tried in addition
 * to the workspace root itself.
 */
const COMMON_TEST_DIRS = ['test', 'tests', '__tests__']

/**
 * Repo-relative candidate paths for a committed snapshot surface.
 *
 * The CLI (and tsnapi's rolldown/vite plugins) always write inside the
 * package's own directory: `<pkgRelDir>/<outputDir>/<stem><ext>`.
 *
 * Vitest's own `toMatchFileSnapshot` — which `snapshotApiPerEntry` /
 * `describePackagesApiSnapshots` build on — instead resolves `outputDir`
 * relative to the *test file's* directory (per the README: "relative to the
 * test file"), and always nests each package's files one level deeper, under
 * `<outputDir>/<pkgName>/`. For a monorepo that's conventionally a single,
 * central test file — the README's own example lives at the workspace root —
 * which has no fixed relationship to any individual package's directory. We
 * can't know exactly where that test file lives (or any custom `outputDir` /
 * `filter` override — see `describePackagesApiSnapshots`'s `filter` hook),
 * so alongside the package's own directory, we also try the workspace root
 * and the common central-test-file directory names, each with and without
 * the `<pkgName>` subfolder.
 */
export function snapshotCandidates(pkgRelDir: string, outputDir: string, pkgName: string, stem: string, ext: string): string[] {
  const join = (...parts: string[]): string => parts.filter(Boolean).join('/')
  const bases = new Set([pkgRelDir, '', ...COMMON_TEST_DIRS])
  const candidates: string[] = []
  for (const base of bases) {
    candidates.push(join(base, outputDir, `${stem}${ext}`))
    candidates.push(join(base, outputDir, pkgName, `${stem}${ext}`))
  }
  return candidates
}

function firstExistingOnDisk(root: string, candidates: string[]): string | null {
  for (const rel of candidates) {
    const abs = resolve(root, rel)
    if (existsSync(abs))
      return readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n')
  }
  return null
}

async function firstExistingAtRef(root: string, ref: string, candidates: string[]): Promise<string | null> {
  for (const rel of candidates) {
    const content = await gitShowFile(root, ref, rel)
    if (content != null)
      return content
  }
  return null
}

const EXT_RUNTIME = '.snapshot.js'
const EXT_DTS = '.snapshot.d.ts'

export interface PackageCtx {
  dir: string
  relDir: string
  name: string
  outputDir: string
  entryStems: { name: string, stem: string }[]
}

/** A resolved side: given an entry stem, returns its snapshot pair (or null). */
interface Side {
  meta: SideMeta
  get: (pkg: PackageCtx, stem: string) => Promise<SnapshotFile | null> | (SnapshotFile | null)
}

/** Committed-snapshot reader for a package/stem at a git ref. */
async function committedAtRef(root: string, ref: string, pkg: PackageCtx, stem: string): Promise<SnapshotFile | null> {
  const runtime = await firstExistingAtRef(root, ref, snapshotCandidates(pkg.relDir, pkg.outputDir, pkg.name, stem, EXT_RUNTIME))
  const dts = await firstExistingAtRef(root, ref, snapshotCandidates(pkg.relDir, pkg.outputDir, pkg.name, stem, EXT_DTS))
  if (runtime == null && dts == null)
    return null
  return { runtime: runtime ?? '', dts: dts ?? '' }
}

/** Committed-snapshot reader for a package/stem on disk (the "working tree" side). */
function committedOnDisk(root: string, pkg: PackageCtx, stem: string): SnapshotFile | null {
  const runtime = firstExistingOnDisk(root, snapshotCandidates(pkg.relDir, pkg.outputDir, pkg.name, stem, EXT_RUNTIME))
  const dts = firstExistingOnDisk(root, snapshotCandidates(pkg.relDir, pkg.outputDir, pkg.name, stem, EXT_DTS))
  if (runtime == null && dts == null)
    return null
  return { runtime: runtime ?? '', dts: dts ?? '' }
}

/**
 * Build the working-tree side: a pure read of whatever committed snapshot
 * currently sits on disk (uncommitted edits included) — no extraction is
 * ever run here. Generating snapshots is the CLI's/Vitest's job; the UI only
 * ever reads them.
 */
function makeWorkingSide(root: string): Side {
  return {
    meta: { kind: 'working', ref: WORKING_TREE, label: 'Working tree' },
    get: (pkg, stem) => committedOnDisk(root, pkg, stem),
  }
}

function makeRefSide(root: string, ref: string, meta: SideMeta): Side {
  return {
    meta,
    get: (pkg, stem) => committedAtRef(root, ref, pkg, stem),
  }
}

async function resolveSide(root: string, ref: string, git: boolean): Promise<Side> {
  if (ref === WORKING_TREE)
    return makeWorkingSide(root)
  const resolved = git ? await resolveRef(root, ref) : null
  const meta: SideMeta = { kind: 'ref', ref, label: resolved ? (resolved.name || resolved.shortSha) : ref, resolved }
  return makeRefSide(root, ref, meta)
}

/**
 * Best-effort resolution of a re-export specifier to a workspace package
 * (and, for subpath specifiers, one of its `package.json` `exports` entries).
 * Bare specifiers are matched against every known workspace package's name,
 * exactly or as a `<name>/<subpath>` prefix; anything else (relative
 * specifiers, external npm packages) is left unresolved.
 */
export function resolveReExportTarget(specifier: string, ctxs: PackageCtx[]): ReExportTarget {
  for (const ctx of ctxs) {
    if (specifier === ctx.name) {
      const entryName = ctx.entryStems.some(e => e.name === '.') ? '.' : undefined
      return { specifier, packageName: ctx.name, entryName }
    }
    if (specifier.startsWith(`${ctx.name}/`)) {
      const entryName = `.${specifier.slice(ctx.name.length)}`
      return {
        specifier,
        packageName: ctx.name,
        entryName: ctx.entryStems.some(e => e.name === entryName) ? entryName : undefined,
      }
    }
  }
  return { specifier }
}

function reExportTargetOf(kind: MemberNode['kind'], source: string | undefined, ctxs: PackageCtx[]): ReExportTarget | undefined {
  return kind === 're-export' && source ? resolveReExportTarget(source, ctxs) : undefined
}

function toMemberNode(m: DiffMember, ctxs: PackageCtx[]): MemberNode {
  return {
    name: m.name,
    display: m.display,
    kind: m.kind,
    referenced: m.referenced,
    status: m.status,
    base: m.base,
    current: m.current,
    reExportTarget: reExportTargetOf(m.kind, m.source, ctxs),
  }
}

/** Wrap parsed members from a single side as unchanged member nodes. */
async function singleSideMembers(file: SnapshotFile, ctxs: PackageCtx[]): Promise<MemberNode[]> {
  const members = await parseMembers(file)
  return members.map(m => ({
    name: m.name,
    display: m.display,
    kind: m.kind,
    referenced: m.referenced,
    status: 'unchanged' as DiffStatus,
    current: { runtime: m.runtime, dts: m.dts },
    reExportTarget: reExportTargetOf(m.kind, m.source, ctxs),
  }))
}

async function buildPackage(
  pkg: PackageCtx,
  base: Side,
  compare: Side,
  isDiff: boolean,
  ctxs: PackageCtx[],
): Promise<PackageNode> {
  const counts = EMPTY_COUNTS()

  if (pkg.entryStems.length === 0) {
    return { name: pkg.name, dir: pkg.relDir || '.', entries: [], status: 'no-api', counts }
  }

  const entries: EntryNode[] = []
  let anyMembers = false
  let anyCompareData = false

  for (const { name, stem } of pkg.entryStems) {
    const baseFile = await base.get(pkg, stem)
    const compareFile = await compare.get(pkg, stem)
    if (compareFile)
      anyCompareData = true

    let members: MemberNode[]
    if (isDiff) {
      const b = baseFile ?? { runtime: '', dts: '' }
      const c = compareFile ?? { runtime: '', dts: '' }
      const diff = await diffMembers(stem, b, c)
      members = diff.map(m => toMemberNode(m, ctxs))
    }
    else {
      const file = compareFile ?? baseFile
      members = file ? await singleSideMembers(file, ctxs) : []
    }

    for (const m of members)
      counts[m.status]++
    if (members.length)
      anyMembers = true

    entries.push({ name, members })
  }

  // No committed snapshot for this package at the compare side, at all.
  const status: PackageNode['status'] = (!anyMembers || !anyCompareData) ? 'no-snapshot' : 'ok'

  return {
    name: pkg.name,
    dir: pkg.relDir || '.',
    entries,
    status,
    counts,
  }
}

async function buildPackageCtxs(root: string): Promise<PackageCtx[]> {
  // Private packages are common noise in a real monorepo (internal tooling,
  // test fixtures, ...) and shouldn't clutter the workspace-wide package
  // list by default — but don't apply that to the single-package fallback
  // below: a repo with no declared workspace *is* the one package you're
  // pointing tsnapi at, private or not, so there's nothing to declutter.
  const isWorkspace = readWorkspacePatterns(root).length > 0
  const dirs = discoverPackages(root).filter(dir => !isWorkspace || !isPrivatePackage(dir))
  const ctxs: PackageCtx[] = []
  for (const dir of dirs) {
    const name = readPackageName(dir) ?? relative(root, dir) ?? dir
    const entries = await resolvePackageEntries(dir).catch(() => [])
    ctxs.push({
      dir,
      relDir: relative(root, dir),
      name,
      outputDir: '__snapshots__/tsnapi',
      entryStems: entries.map(e => ({ name: e.name, stem: entryNameToStem(e.name) })),
    })
  }
  return ctxs.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Build the full workspace payload for a base/compare request. When both sides
 * are the working tree (or identical), a single-state (non-diff) view is
 * produced.
 */
export async function buildPayload(cwd: string, req: PayloadRequest): Promise<WorkspacePayload> {
  const root = (await repoRoot(cwd)) ?? resolve(cwd)
  const git = await isGitRepo(cwd)

  const baseRef = req.base
  const compareRef = req.compare
  const isDiff = baseRef !== compareRef

  const [base, compare] = await Promise.all([
    resolveSide(root, baseRef, git),
    resolveSide(root, compareRef, git),
  ])

  const ctxs = await buildPackageCtxs(root)
  const packages: PackageNode[] = []
  for (const pkg of ctxs)
    packages.push(await buildPackage(pkg, base, compare, isDiff, ctxs))

  return {
    root,
    isDiff,
    git,
    base: base.meta,
    compare: compare.meta,
    packages,
  }
}

/** Repo-relative snapshot dir globs used to scope the "relevant history". */
function snapshotHistoryPaths(ctxs: PackageCtx[]): string[] {
  const paths = new Set<string>()
  for (const pkg of ctxs) {
    const dir = [pkg.relDir, pkg.outputDir].filter(Boolean).join('/')
    paths.add(dir)
  }
  return [...paths]
}

/** Build the ref/commit picker payload. */
export async function buildRefs(cwd: string, options?: { all?: boolean, limit?: number }): Promise<RefsPayload> {
  const root = (await repoRoot(cwd)) ?? resolve(cwd)
  const git = await isGitRepo(cwd)
  if (!git)
    return { git: false, branches: [], tags: [], commits: [], head: null }

  const ctxs = await buildPackageCtxs(root)
  const scoped = options?.all ? [] : snapshotHistoryPaths(ctxs)
  const [{ branches, tags }, commits, head] = await Promise.all([
    listNamedRefs(root),
    listCommits(root, scoped, options?.limit ?? 100),
    resolveRef(root, 'HEAD'),
  ])
  return { git: true, branches, tags, commits, head }
}
