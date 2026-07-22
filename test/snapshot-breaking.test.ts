import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveAllowBreaking, snapshotFiles } from '../src/core/index.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tsnapi-breaking-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeEntry(runtime: string, dts: string): void {
  writeFileSync(join(dir, 'index.mjs'), runtime)
  writeFileSync(join(dir, 'index.d.mts'), dts)
}

const files = [{ name: '.', runtime: 'index.mjs', dts: 'index.d.mts' }]

async function snap(options?: Parameters<typeof snapshotFiles>[2]) {
  return snapshotFiles(files, dir, { header: false, ...options })
}

describe('snapshotFiles breaking guard', () => {
  it('blocks a breaking update and does not overwrite', async () => {
    writeEntry(
      `export function a() {}\nexport function b() {}`,
      `export declare function a(): void;\nexport declare function b(): void;`,
    )
    await snap() // create baseline

    // Remove export `b` — breaking
    writeEntry(`export function a() {}`, `export declare function a(): void;`)
    const result = await snap({ update: true })

    expect(result.hasChanges).toBe(true)
    expect(result.breaking).toHaveLength(1)
    expect(result.breaking[0].removed).toEqual(['b'])
    expect(result.diff).toContain('Breaking API changes detected')

    // Snapshot on disk must be untouched (still contains `b`)
    const onDisk = readFileSync(join(dir, '__snapshots__/tsnapi/index.snapshot.d.ts'), 'utf-8')
    expect(onDisk).toContain('b')
  })

  it('allows a breaking update when allowBreaking is set', async () => {
    writeEntry(
      `export function a() {}\nexport function b() {}`,
      `export declare function a(): void;\nexport declare function b(): void;`,
    )
    await snap()

    writeEntry(`export function a() {}`, `export declare function a(): void;`)
    const result = await snap({ update: true, allowBreaking: true })

    expect(result.hasChanges).toBe(false)
    expect(result.breaking).toEqual([])

    const onDisk = readFileSync(join(dir, '__snapshots__/tsnapi/index.snapshot.d.ts'), 'utf-8')
    expect(onDisk).not.toContain('b(')
  })

  it('allows an additive update without allowBreaking', async () => {
    writeEntry(`export function a() {}`, `export declare function a(): void;`)
    await snap()

    writeEntry(
      `export function a() {}\nexport function c() {}`,
      `export declare function a(): void;\nexport declare function c(): void;`,
    )
    const result = await snap({ update: true })

    expect(result.hasChanges).toBe(false)
    expect(result.breaking).toEqual([])
    const onDisk = readFileSync(join(dir, '__snapshots__/tsnapi/index.snapshot.d.ts'), 'utf-8')
    expect(onDisk).toContain('c')
  })
})

describe('resolveAllowBreaking', () => {
  const original = process.env.TSNAPI_ALLOW_BREAKING
  afterEach(() => {
    if (original === undefined)
      delete process.env.TSNAPI_ALLOW_BREAKING
    else
      process.env.TSNAPI_ALLOW_BREAKING = original
  })

  it('honors an explicit value over env', () => {
    process.env.TSNAPI_ALLOW_BREAKING = '1'
    expect(resolveAllowBreaking(false)).toBe(false)
    expect(resolveAllowBreaking(true)).toBe(true)
  })

  it('reads TSNAPI_ALLOW_BREAKING=1 from env', () => {
    process.env.TSNAPI_ALLOW_BREAKING = '1'
    expect(resolveAllowBreaking()).toBe(true)
    process.env.TSNAPI_ALLOW_BREAKING = 'true'
    expect(resolveAllowBreaking()).toBe(true)
  })

  it('defaults to false', () => {
    delete process.env.TSNAPI_ALLOW_BREAKING
    expect(resolveAllowBreaking()).toBe(false)
  })
})
