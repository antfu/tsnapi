import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { build } from 'tsdown'
import { describe, expect, it } from 'vitest'
import { generateApiSnapshot } from '../src/core/index.ts'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

async function buildFixture(fixture: string): Promise<void> {
  const fixtureDir = join(FIXTURES_DIR, fixture)
  rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })
  await build({ cwd: fixtureDir, silent: true })
}

describe('generateApiSnapshot', () => {
  it('basic fixture', async () => {
    await buildFixture('basic')
    const api = generateApiSnapshot(join(FIXTURES_DIR, 'basic'))

    expect(api['.']).toBeDefined()
    expect(api['.'].runtime).toMatchInlineSnapshot(`
      "export var DEBUG /* const */
      export async function fetchData(url, options) { /* ... */ }
      export function greet(name) { /* ... */ }
      export function* range(start, end) { /* ... */ }
      export var VERSION /* const */
      "
    `)
    expect(api['.'].dts).toMatchInlineSnapshot(`
      "export declare const DEBUG: boolean;
      export declare function fetchData(_: string, _?: RequestInit): Promise<Response>;
      export type Formatter = (input: string) => string;
      export declare function greet(_: string): string;
      export interface GreetOptions {
        prefix?: string;
        suffix?: string;
      }
      export declare function range(_: number, _: number): Generator<number>;
      export declare const VERSION: string;
      "
    `)
  })

  it('sub-exports fixture with multiple entries', async () => {
    await buildFixture('sub-exports')
    const api = generateApiSnapshot(join(FIXTURES_DIR, 'sub-exports'))

    expect(Object.keys(api).sort()).toEqual(['.', './utils'])

    expect(api['.'].runtime).toMatchInlineSnapshot(`
      "export function createApp(options) { /* ... */ }
      export function createRouter(options) { /* ... */ }
      export var VERSION /* const */
      "
    `)

    expect(api['./utils'].runtime).toMatchInlineSnapshot(`
      "export function capitalize(text) { /* ... */ }
      export function slugify(text) { /* ... */ }
      "
    `)

    expect(api['./utils'].dts).toMatchInlineSnapshot(`
      "export declare function capitalize(_: string): string;
      export declare function slugify(_: string): string;
      export type StringTransform = (input: string) => string;
      "
    `)
  })

  it('re-exports fixture uses public names', async () => {
    await buildFixture('re-exports')
    const api = generateApiSnapshot(join(FIXTURES_DIR, 're-exports'))

    expect(api['.'].runtime).toMatchInlineSnapshot(`
      "export function formatOutput(value) { /* ... */ }
      export function process(data, options) { /* ... */ }
      export class Service {
        name
        constructor(name) { /* ... */ }
        run(input) { /* ... */ }
      }
      export var VERSION /* const */
      "
    `)

    // Should use public names, not internal names
    expect(api['.'].dts).not.toContain('export interface InternalOptions')
    expect(api['.'].dts).toContain('export interface Options')
    expect(api['.'].dts).toContain('export declare class Service')
  })
})
