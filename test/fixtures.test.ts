import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'tsdown'
import { describe, expect, it } from 'vitest'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

function snapshotDir(fixture: string): string {
  return join(FIXTURES_DIR, fixture, '__snapshots__')
}

function readSnap(fixture: string, name: string): string {
  return readFileSync(join(snapshotDir(fixture), name), 'utf-8')
}

async function buildFixture(fixture: string): Promise<void> {
  const fixtureDir = join(FIXTURES_DIR, fixture)
  // Clean dist only, snapshots are committed
  rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })

  await build({
    cwd: fixtureDir,
    silent: true,
  })
}

describe('fixture: basic', () => {
  it('snapshots functions, constants, and types', async () => {
    await buildFixture('basic')

    const runtime = readSnap('basic', 'index.api.snapshot.js')
    const dts = readSnap('basic', 'index.api.snapshot.d.ts')

    // Runtime: functions with empty bodies, constants without values
    expect(runtime).toContain('greet')
    expect(runtime).toContain('fetchData')
    expect(runtime).toContain('{ /* ... */ }')
    expect(runtime).toContain('VERSION')
    expect(runtime).toContain('DEBUG')
    expect(runtime).toContain('range')

    // DTS: typed signatures
    expect(dts).toContain('greet')
    expect(dts).toContain('string')
    expect(dts).toContain('GreetOptions')
    expect(dts).toContain('Formatter')
    expect(dts).toContain('fetchData')

    // Second build should pass (idempotent)
    await buildFixture('basic')
  })
})

describe('fixture: class-inheritance', () => {
  it('snapshots abstract classes, inheritance, enums', async () => {
    await buildFixture('class-inheritance')

    const runtime = readSnap('class-inheritance', 'index.api.snapshot.js')
    const dts = readSnap('class-inheritance', 'index.api.snapshot.d.ts')

    // Runtime: classes should be recovered from var X = class { ... }
    expect(runtime).toContain('class BaseLogger')
    expect(runtime).toContain('class ConsoleLogger')
    expect(runtime).toContain('class BufferedLogger')
    expect(runtime).toContain('LogLevel')

    expect(dts).toContain('BaseLogger')
    expect(dts).toContain('ConsoleLogger')
    expect(dts).toContain('BufferedLogger')
    expect(dts).toContain('LogLevel')
    expect(dts).toContain('LoggerFactory')

    // Idempotent
    await buildFixture('class-inheritance')
  })
})

describe('fixture: importing-libs', () => {
  it('snapshots code that imports from node:fs and node:path', async () => {
    await buildFixture('importing-libs')

    const runtime = readSnap('importing-libs', 'index.api.snapshot.js')
    const dts = readSnap('importing-libs', 'index.api.snapshot.d.ts')

    expect(runtime).toContain('readFile')
    expect(runtime).toContain('writeFile')
    expect(runtime).toContain('fileExists')
    expect(runtime).toContain('joinPaths')

    expect(dts).toContain('FileOptions')
    expect(dts).toContain('PathLike')

    // Idempotent
    await buildFixture('importing-libs')
  })
})

describe('fixture: sub-exports', () => {
  it('snapshots re-exports from sub-modules', async () => {
    await buildFixture('sub-exports')

    const runtime = readSnap('sub-exports', 'index.api.snapshot.js')
    const dts = readSnap('sub-exports', 'index.api.snapshot.d.ts')

    expect(runtime).toContain('createApp')
    expect(runtime).toContain('createRouter')
    expect(runtime).toContain('VERSION')

    expect(dts).toContain('AppOptions')
    expect(dts).toContain('Route')
    expect(dts).toContain('RouterOptions')

    // Utils sub-entry
    const utilsRuntime = readSnap('sub-exports', 'utils.api.snapshot.js')
    const utilsDts = readSnap('sub-exports', 'utils.api.snapshot.d.ts')

    expect(utilsRuntime).toContain('slugify')
    expect(utilsRuntime).toContain('capitalize')

    expect(utilsDts).toContain('StringTransform')

    // Idempotent
    await buildFixture('sub-exports')
  })
})

describe('fixture: re-exports', () => {
  it('snapshots aliased re-exports with correct public names', async () => {
    await buildFixture('re-exports')

    const runtime = readSnap('re-exports', 'index.api.snapshot.js')
    const dts = readSnap('re-exports', 'index.api.snapshot.d.ts')

    // Aliased exports should use public names, not internal names
    expect(runtime).toContain('Service')
    expect(runtime).toContain('process')
    expect(runtime).toContain('VERSION')
    expect(runtime).toContain('formatOutput')
    expect(runtime).not.toContain('InternalService')
    expect(runtime).not.toContain('internalProcess')
    expect(runtime).not.toContain('INTERNAL_VERSION')

    expect(dts).toContain('export declare class Service')
    expect(dts).toContain('export interface Options')
    expect(dts).toContain('Formatter')
    // Export declarations use public names (not internal names)
    expect(dts).not.toContain('export interface InternalOptions')

    // Idempotent
    await buildFixture('re-exports')
  })
})

describe('fixture: multiple-entries', () => {
  it('snapshots multiple independent entry points', async () => {
    await buildFixture('multiple-entries')

    // Client entry
    const clientRuntime = readSnap('multiple-entries', 'client.api.snapshot.js')
    const clientDts = readSnap('multiple-entries', 'client.api.snapshot.d.ts')

    expect(clientRuntime).toContain('HttpClient')
    expect(clientRuntime).toContain('createClient')
    expect(clientDts).toContain('ClientOptions')
    expect(clientDts).toContain('HttpClient')

    // Server entry
    const serverRuntime = readSnap('multiple-entries', 'server.api.snapshot.js')
    const serverDts = readSnap('multiple-entries', 'server.api.snapshot.d.ts')

    expect(serverRuntime).toContain('Server')
    expect(serverRuntime).toContain('createServer')
    expect(serverDts).toContain('ServerOptions')
    expect(serverDts).toContain('Middleware')

    expect(existsSync(join(snapshotDir('multiple-entries'), 'client.api.snapshot.js'))).toBe(true)
    expect(existsSync(join(snapshotDir('multiple-entries'), 'client.api.snapshot.d.ts'))).toBe(true)
    expect(existsSync(join(snapshotDir('multiple-entries'), 'server.api.snapshot.js'))).toBe(true)
    expect(existsSync(join(snapshotDir('multiple-entries'), 'server.api.snapshot.d.ts'))).toBe(true)

    // Idempotent
    await buildFixture('multiple-entries')
  })
})
