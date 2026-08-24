import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverPackages, isPrivatePackage, resolveWorkspacePackages } from '../src/core/workspace.ts'

const tempDirs: string[] = []

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tsnapi-workspace-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs)
    rmSync(dir, { recursive: true, force: true })
  tempDirs.length = 0
})

describe('isPrivatePackage', () => {
  it('is true when package.json sets "private": true', () => {
    const cwd = createTempDir()
    writeJson(join(cwd, 'package.json'), { name: 'fixture', private: true })
    expect(isPrivatePackage(cwd)).toBe(true)
  })

  it('is false when "private" is absent', () => {
    const cwd = createTempDir()
    writeJson(join(cwd, 'package.json'), { name: 'fixture' })
    expect(isPrivatePackage(cwd)).toBe(false)
  })

  it('is false when "private" is explicitly false', () => {
    const cwd = createTempDir()
    writeJson(join(cwd, 'package.json'), { name: 'fixture', private: false })
    expect(isPrivatePackage(cwd)).toBe(false)
  })

  it('is false when package.json is missing', () => {
    const cwd = createTempDir()
    expect(isPrivatePackage(cwd)).toBe(false)
  })
})

describe('resolveWorkspacePackages', () => {
  it('excludes node_modules even under a recursive workspace pattern', () => {
    const cwd = createTempDir()
    writeJson(join(cwd, 'package.json'), { name: 'root', workspaces: ['packages/**'] })
    writeJson(join(cwd, 'packages/pkg-a/package.json'), { name: 'pkg-a' })
    // A hoisted/nested dependency inside a package's own node_modules has a
    // package.json too — it must not be mistaken for a workspace package.
    writeJson(join(cwd, 'packages/pkg-a/node_modules/some-dep/package.json'), { name: 'some-dep' })

    const dirs = resolveWorkspacePackages(cwd)
    expect(dirs).toEqual([resolve(cwd, 'packages/pkg-a')])
  })

  it('still resolves ordinary one-level workspace packages', () => {
    const cwd = createTempDir()
    writeJson(join(cwd, 'package.json'), { name: 'root', workspaces: ['packages/*'] })
    writeJson(join(cwd, 'packages/pkg-a/package.json'), { name: 'pkg-a' })
    writeJson(join(cwd, 'packages/pkg-b/package.json'), { name: 'pkg-b' })

    const dirs = resolveWorkspacePackages(cwd)
    expect(dirs).toEqual([resolve(cwd, 'packages/pkg-a'), resolve(cwd, 'packages/pkg-b')])
  })
})

describe('discoverPackages', () => {
  it('falls back to the single package at cwd when no workspace is declared', () => {
    const cwd = createTempDir()
    writeJson(join(cwd, 'package.json'), { name: 'fixture', private: true })

    // discoverPackages itself doesn't filter by `private` — that's scoped to
    // the UI's own package-listing logic (`payload.ts`), not this shared
    // discovery helper (which the CLI/vitest paths also rely on).
    expect(discoverPackages(cwd)).toEqual([resolve(cwd)])
  })
})
