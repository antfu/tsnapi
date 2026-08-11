import type { DiffMember, DiffStatus, SnapshotFile } from '../../core/index.ts'
import type {
  EntryNode,
  MemberNode,
  PackageNode,
  PayloadRequest,
  RefsPayload,
  SideMeta,
  UiExtractOptions,
  WorkspacePayload,
} from './types.ts'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import {
  diffMembers,
  discoverPackages,
  generateApiSnapshot,
  parseMembers,
  readPackageName,
  resolvePackageEntries,
} from '../../core/index.ts'
import { gitShowFile, isGitRepo, listCommits, listNamedRefs, repoRoot, resolveRef } from './git.ts'
import { DEFAULT_EXTRACT_OPTIONS, WORKING_TREE } from './types.ts'

const EMPTY_COUNTS = (): Record<DiffStatus, number> => ({ added: 0, removed: 0, modified: 0, widened: 0, unchanged: 0 })

const LEADING_DOT_SLASH_RE = /^\.\//
function entryNameToStem(name: string): string {
  if (name === '.' || name === './')
    return 'index'
  return name.replace(LEADING_DOT_SLASH_RE, '')
}

/**
 * Repo-relative candidate paths for a committed snapshot surface. Covers both
 * the CLI layout (`<outputDir>/<stem>`) and the vitest per-package layout
 * (`<outputDir>/<pkgName>/<stem>`).
 */
function snapshotCandidates(pkgRelDir: string, outputDir: string, pkgName: string, stem: string, ext: string): string[] {
  const join = (...parts: string[]): string => parts.filter(Boolean).join('/')
  return [
    join(pkgRelDir, outputDir, `${stem}${ext}`),
    join(pkgRelDir, outputDir, pkgName, `${stem}${ext}`),
  ]
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

interface PackageCtx {
  dir: string
  relDir: string
  name: string
  outputDir: string
  entryStems: { name: string, stem: string }[]
}

/** A resolved side: given an entry stem, returns its snapshot pair (or null). */
interface Side {
  meta: SideMeta
  /** Whether this side reads the working tree (live dist). */
  working: boolean
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

/** Committed-snapshot reader for a package/stem on disk (working-tree fallback). */
function committedOnDisk(root: string, pkg: PackageCtx, stem: string): SnapshotFile | null {
  const runtime = firstExistingOnDisk(root, snapshotCandidates(pkg.relDir, pkg.outputDir, pkg.name, stem, EXT_RUNTIME))
  const dts = firstExistingOnDisk(root, snapshotCandidates(pkg.relDir, pkg.outputDir, pkg.name, stem, EXT_DTS))
  if (runtime == null && dts == null)
    return null
  return { runtime: runtime ?? '', dts: dts ?? '' }
}

/**
 * Build a working-tree side: extract live from dist when present, otherwise
 * fall back to the committed snapshot on disk. Caches per-package extraction.
 */
function makeWorkingSide(root: string, options: UiExtractOptions): Side {
  const cache = new Map<string, { map: Map<string, SnapshotFile>, usedFallback: boolean } | Promise<any>>()

  async function loadPackage(pkg: PackageCtx): Promise<{ map: Map<string, SnapshotFile>, usedFallback: boolean }> {
    const map = new Map<string, SnapshotFile>()
    // Does any dist file exist?
    const entries = await resolvePackageEntries(pkg.dir).catch(() => [])
    const hasDist = entries.some(e => (e.runtime && existsSync(e.runtime)) || (e.dts && existsSync(e.dts)))

    if (hasDist) {
      try {
        const api = await generateApiSnapshot(pkg.dir, {
          header: false,
          omitArgumentNames: options.omitArgumentNames,
          typeWidening: options.typeWidening,
          referenceTracingDepth: options.referenceTracingDepth,
        })
        for (const [name, snap] of Object.entries(api))
          map.set(entryNameToStem(name), snap)
        return { map, usedFallback: false }
      }
      catch {
        // fall through to committed fallback
      }
    }

    // Fallback: committed snapshots on disk.
    let usedFallback = false
    for (const { stem } of pkg.entryStems) {
      const snap = committedOnDisk(root, pkg, stem)
      if (snap) {
        map.set(stem, snap)
        usedFallback = true
      }
    }
    return { map, usedFallback }
  }

  return {
    working: true,
    meta: { kind: 'working', ref: WORKING_TREE, label: 'Working tree' },
    async get(pkg, stem) {
      let entry = cache.get(pkg.dir)
      if (!entry) {
        entry = loadPackage(pkg)
        cache.set(pkg.dir, entry)
      }
      const resolved = await entry
      cache.set(pkg.dir, resolved)
      return resolved.map.get(stem) ?? null
    },
  }
}

function makeRefSide(root: string, ref: string, meta: SideMeta): Side {
  return {
    working: false,
    meta,
    get: (pkg, stem) => committedAtRef(root, ref, pkg, stem),
  }
}

async function resolveSide(root: string, ref: string, git: boolean, options: UiExtractOptions): Promise<Side> {
  if (ref === WORKING_TREE)
    return makeWorkingSide(root, options)
  const resolved = git ? await resolveRef(root, ref) : null
  const meta: SideMeta = { kind: 'ref', ref, label: resolved ? (resolved.name || resolved.shortSha) : ref, resolved }
  return makeRefSide(root, ref, meta)
}

function toMemberNode(m: DiffMember): MemberNode {
  return {
    name: m.name,
    display: m.display,
    kind: m.kind,
    referenced: m.referenced,
    status: m.status,
    base: m.base,
    current: m.current,
  }
}

/** Wrap parsed members from a single side as unchanged member nodes. */
async function singleSideMembers(file: SnapshotFile): Promise<MemberNode[]> {
  const members = await parseMembers(file)
  return members.map(m => ({
    name: m.name,
    display: m.display,
    kind: m.kind,
    referenced: m.referenced,
    status: 'unchanged' as DiffStatus,
    current: { runtime: m.runtime, dts: m.dts },
  }))
}

async function buildPackage(
  pkg: PackageCtx,
  base: Side,
  compare: Side,
  isDiff: boolean,
): Promise<PackageNode> {
  const counts = EMPTY_COUNTS()

  if (pkg.entryStems.length === 0) {
    return { name: pkg.name, dir: pkg.relDir || '.', entries: [], status: 'no-api', usedFallback: false, counts }
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
      members = diff.map(toMemberNode)
    }
    else {
      const file = compareFile ?? baseFile
      members = file ? await singleSideMembers(file) : []
    }

    for (const m of members)
      counts[m.status]++
    if (members.length)
      anyMembers = true

    entries.push({ name, members })
  }

  // Determine package-level status from the compare (primary) side.
  const workingFallback = compare.working && (await isWorkingFallback(compare, pkg))
  let status: PackageNode['status'] = 'ok'
  if (!anyMembers) {
    status = compare.working ? 'unbuilt' : 'no-snapshot'
  }
  else if (!anyCompareData && !compare.working) {
    status = 'no-snapshot'
  }
  else if (workingFallback) {
    status = 'unbuilt'
  }

  return {
    name: pkg.name,
    dir: pkg.relDir || '.',
    entries,
    status,
    usedFallback: workingFallback,
    counts,
  }
}

async function isWorkingFallback(side: Side, pkg: PackageCtx): Promise<boolean> {
  // Re-run get for the first stem to observe the cached fallback flag is
  // awkward; instead, cheaply re-check dist presence.
  const entries = await resolvePackageEntries(pkg.dir).catch(() => [])
  return !entries.some(e => (e.runtime && existsSync(e.runtime)) || (e.dts && existsSync(e.dts)))
}

async function buildPackageCtxs(root: string): Promise<PackageCtx[]> {
  const dirs = discoverPackages(root)
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
  const options: UiExtractOptions = { ...DEFAULT_EXTRACT_OPTIONS, ...req.options }

  const baseRef = req.base
  const compareRef = req.compare
  const isDiff = baseRef !== compareRef

  const [base, compare] = await Promise.all([
    resolveSide(root, baseRef, git, options),
    resolveSide(root, compareRef, git, options),
  ])

  const ctxs = await buildPackageCtxs(root)
  const packages: PackageNode[] = []
  for (const pkg of ctxs)
    packages.push(await buildPackage(pkg, base, compare, isDiff))

  return {
    root,
    isDiff,
    git,
    base: base.meta,
    compare: compare.meta,
    packages,
    options,
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
