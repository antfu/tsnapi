import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolldown } from 'rolldown'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApiSnapshot from '../src/rolldown.ts'

const FIXTURE_DIR = join(import.meta.dirname, '.fixtures')
const SNAPSHOT_DIR = join(FIXTURE_DIR, '__snapshots__')

function writeFixture(name: string, code: string): string {
  const dir = join(FIXTURE_DIR, 'src')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, code)
  return path
}

afterEach(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true })
})

describe('apiSnapshot plugin', () => {
  it('creates runtime snapshot on first build', async () => {
    const entry = writeFixture('index.mjs', `
export function greet(name) {
  return 'Hello, ' + name;
}
export const VERSION = '1.0.0';
export class App {
  constructor(config) {
    this.config = config;
  }
  start() {
    console.log('started');
  }
}
`)

    const bundle = await rolldown({
      input: entry,
      plugins: [ApiSnapshot({ outputDir: SNAPSHOT_DIR })],
    })
    await bundle.write({ dir: join(FIXTURE_DIR, 'dist') })

    const snapshotPath = join(SNAPSHOT_DIR, 'index.snapshot.js')
    expect(existsSync(snapshotPath)).toBe(true)

    const content = readFileSync(snapshotPath, 'utf-8')
    expect(content).toContain('export class App')
    expect(content).toContain('export function greet(_)')
    expect(content).toContain('export var VERSION /* const */')
  })

  it('passes when snapshot matches', async () => {
    const entry = writeFixture('index.mjs', `
export function hello() { return 'hi'; }
`)

    const buildOnce = async () => {
      const bundle = await rolldown({
        input: entry,
        plugins: [ApiSnapshot({ outputDir: SNAPSHOT_DIR })],
      })
      await bundle.write({ dir: join(FIXTURE_DIR, 'dist') })
    }

    // First build creates snapshot
    await buildOnce()
    // Second build should pass (no changes)
    await buildOnce()
  })

  it('errors when snapshot changes', async () => {
    const srcDir = join(FIXTURE_DIR, 'src')
    mkdirSync(srcDir, { recursive: true })
    const entryPath = join(srcDir, 'index.mjs')

    // First build
    writeFileSync(entryPath, `export function hello() { return 'hi'; }`)
    const bundle1 = await rolldown({
      input: entryPath,
      plugins: [ApiSnapshot({ outputDir: SNAPSHOT_DIR })],
    })
    await bundle1.write({ dir: join(FIXTURE_DIR, 'dist') })

    // Modify the API
    writeFileSync(entryPath, `export function hello(name) { return 'hi ' + name; }\nexport function goodbye() { return 'bye'; }`)

    // Second build should error
    const bundle2 = await rolldown({
      input: entryPath,
      plugins: [ApiSnapshot({ outputDir: SNAPSHOT_DIR })],
    })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      bundle2.write({ dir: join(FIXTURE_DIR, 'dist') }),
    ).rejects.toThrow(/snapshot mismatch/)
    vi.restoreAllMocks()
  })

  it('updates snapshot with update option', async () => {
    const srcDir = join(FIXTURE_DIR, 'src')
    mkdirSync(srcDir, { recursive: true })
    const entryPath = join(srcDir, 'index.mjs')

    // First build
    writeFileSync(entryPath, `export function hello() { return 'hi'; }`)
    const bundle1 = await rolldown({
      input: entryPath,
      plugins: [ApiSnapshot({ outputDir: SNAPSHOT_DIR })],
    })
    await bundle1.write({ dir: join(FIXTURE_DIR, 'dist') })

    // Modify the API
    writeFileSync(entryPath, `export function hello(name) { return 'hi ' + name; }`)

    // Build with update mode - should not error
    const bundle2 = await rolldown({
      input: entryPath,
      plugins: [ApiSnapshot({ outputDir: SNAPSHOT_DIR, update: true })],
    })
    await bundle2.write({ dir: join(FIXTURE_DIR, 'dist') })

    // Verify updated snapshot reflects the new param
    const content = readFileSync(join(SNAPSHOT_DIR, 'index.snapshot.js'), 'utf-8')
    expect(content).toContain('hello(_)')
  })
})
