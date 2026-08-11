import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** A git ref the UI can compare against. */
export interface GitRef {
  /** Full or short object name. */
  sha: string
  /** Short sha for display. */
  shortSha: string
  /** Symbolic name (branch/tag) when applicable, else the short sha. */
  name: string
  /** `branch` | `tag` | `commit`. */
  type: 'branch' | 'tag' | 'commit'
  /** First line of the commit message. */
  subject: string
  /** Author date, ISO-ish, when known. */
  date?: string
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

/** Whether `cwd` is inside a git work tree. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  }
  catch {
    return false
  }
}

/** Absolute path of the repository root, or `null` when not a repo. */
export async function repoRoot(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  }
  catch {
    return null
  }
}

/**
 * Read a committed file at a given ref via `git show <ref>:<path>`. The path
 * must be relative to the repo root and use forward slashes. Returns `null`
 * when the file does not exist at that ref.
 */
export async function gitShowFile(cwd: string, ref: string, relPath: string): Promise<string | null> {
  try {
    const out = await git(cwd, ['show', `${ref}:${relPath}`])
    return out.replace(/\r\n/g, '\n')
  }
  catch {
    return null
  }
}

/** Resolve any ref/sha to a concrete {@link GitRef}, or `null` when unknown. */
export async function resolveRef(cwd: string, ref: string): Promise<GitRef | null> {
  try {
    const out = await git(cwd, ['log', '-1', '--format=%H%x00%h%x00%s%x00%aI', ref])
    const [sha, shortSha, subject, date] = out.trim().split('\0')
    return { sha, shortSha, name: ref, type: 'commit', subject, date }
  }
  catch {
    return null
  }
}

async function forEachRef(cwd: string, pattern: string, type: 'branch' | 'tag'): Promise<GitRef[]> {
  try {
    const out = await git(cwd, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname:short)%00%(objectname)%00%(objectname:short)%00%(contents:subject)%00%(committerdate:iso-strict)',
      pattern,
    ])
    return out.split('\n').filter(Boolean).map((line) => {
      const [name, sha, shortSha, subject, date] = line.split('\0')
      return { name, sha, shortSha, type, subject, date }
    })
  }
  catch {
    return []
  }
}

/**
 * List commits, optionally restricted to those that touched any of
 * `snapshotPaths` (the API-relevant history). Newest first.
 */
export async function listCommits(cwd: string, snapshotPaths: string[], limit = 100): Promise<GitRef[]> {
  const args = ['log', `--max-count=${limit}`, '--format=%H%x00%h%x00%s%x00%aI']
  if (snapshotPaths.length)
    args.push('--', ...snapshotPaths)
  try {
    const out = await git(cwd, args)
    return out.split('\n').filter(Boolean).map((line) => {
      const [sha, shortSha, subject, date] = line.split('\0')
      return { sha, shortSha, name: shortSha, type: 'commit' as const, subject, date }
    })
  }
  catch {
    return []
  }
}

/** Branches and tags in the repo, newest-committed first. */
export async function listNamedRefs(cwd: string): Promise<{ branches: GitRef[], tags: GitRef[] }> {
  const [branches, tags] = await Promise.all([
    forEachRef(cwd, 'refs/heads', 'branch'),
    forEachRef(cwd, 'refs/tags', 'tag'),
  ])
  return { branches, tags }
}
