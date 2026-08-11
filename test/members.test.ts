import { describe, expect, it } from 'vitest'
import { diffMembers, parseMembers } from '../src/core/members.ts'

const base = {
  runtime: `export function foo() {}\nexport var VERSION /* const */`,
  dts: `export declare function foo(_: string): void;\nexport interface Options { a: string }\nexport declare const VERSION: string;`,
}

describe('parseMembers', () => {
  it('merges runtime and dts surfaces by name and classifies kind', async () => {
    const members = await parseMembers(base)
    const byName = Object.fromEntries(members.map(m => [m.name, m]))

    expect(byName.foo.kind).toBe('function')
    expect(byName.foo.runtime).toContain('function foo')
    expect(byName.foo.dts).toContain('declare function foo')

    expect(byName.Options.kind).toBe('interface')
    expect(byName.Options.dts).toContain('interface Options')
    expect(byName.Options.runtime).toBeUndefined()

    expect(byName.VERSION.kind).toBe('variable')
  })
})

describe('diffMembers', () => {
  it('classifies added / removed / modified / widened / unchanged', async () => {
    const current = {
      runtime: `export function foo() {}\nexport function bar() {}`,
      dts: `export declare function foo(_: string): void;\nexport interface Options { a: string; b: number }\nexport declare function bar(): void;`,
    }
    const diff = await diffMembers('index', base, current)
    const byName = Object.fromEntries(diff.map(m => [m.name, m.status]))

    expect(byName.bar).toBe('added') // new export
    expect(byName.VERSION).toBe('removed') // dropped
    expect(byName.Options).toBe('widened') // gained a member
    expect(byName.foo).toBe('unchanged')
  })

  it('flags a narrowed member as modified (breaking)', async () => {
    const current = {
      runtime: base.runtime,
      dts: `export declare function foo(_: string): void;\nexport interface Options {}\nexport declare const VERSION: string;`,
    }
    const diff = await diffMembers('index', base, current)
    const options = diff.find(m => m.name === 'Options')!
    expect(options.status).toBe('modified')
    expect(options.base?.dts).toContain('a: string')
    expect(options.current?.dts).toContain('{}')
  })
})
