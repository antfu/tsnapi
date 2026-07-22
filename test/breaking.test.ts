import type { SnapshotFile } from '../src/core/snapshot.ts'
import { describe, expect, it } from 'vitest'
import { analyzeApiChanges, formatBreakingChanges, isBreakingChange } from '../src/core/breaking.ts'

function file(runtime: string, dts: string): SnapshotFile {
  return { runtime, dts }
}

describe('analyzeApiChanges', () => {
  it('reports no changes for identical snapshots', async () => {
    const snap = file(
      `export function greet(_) {}`,
      `export declare function greet(_: string): string;`,
    )
    const change = await analyzeApiChanges('index', snap, snap)
    expect(change).toEqual({ entryName: 'index', removed: [], modified: [], widened: [], added: [] })
    expect(isBreakingChange(change)).toBe(false)
  })

  it('classifies a new export as additive, not breaking', async () => {
    const existing = file(
      `export function greet(_) {}`,
      `export declare function greet(_: string): string;`,
    )
    const current = file(
      `export function greet(_) {}\nexport function shout(_) {}`,
      `export declare function greet(_: string): string;\nexport declare function shout(_: string): string;`,
    )
    const change = await analyzeApiChanges('index', existing, current)
    expect(change.added).toEqual(['shout'])
    expect(change.removed).toEqual([])
    expect(change.modified).toEqual([])
    expect(isBreakingChange(change)).toBe(false)
  })

  it('classifies a removed export as breaking', async () => {
    const existing = file(
      `export function greet(_) {}\nexport function shout(_) {}`,
      `export declare function greet(_: string): string;\nexport declare function shout(_: string): string;`,
    )
    const current = file(
      `export function greet(_) {}`,
      `export declare function greet(_: string): string;`,
    )
    const change = await analyzeApiChanges('index', existing, current)
    expect(change.removed).toEqual(['shout'])
    expect(change.added).toEqual([])
    expect(isBreakingChange(change)).toBe(true)
  })

  it('classifies a replaced return type as breaking (narrowed)', async () => {
    const existing = file(
      `export function greet(_) {}`,
      `export declare function greet(_: string): string;`,
    )
    const current = file(
      `export function greet(_) {}`,
      `export declare function greet(_: string): number;`,
    )
    const change = await analyzeApiChanges('index', existing, current)
    expect(change.modified).toEqual(['greet'])
    expect(isBreakingChange(change)).toBe(true)
  })

  describe('lossy widening (not breaking)', () => {
    it('adding a new interface property is additive', async () => {
      const existing = file('', `export interface Options {\n  a: string;\n}`)
      const current = file('', `export interface Options {\n  a: string;\n  b: number;\n}`)
      const change = await analyzeApiChanges('index', existing, current)
      expect(change.widened).toEqual(['Options'])
      expect(change.modified).toEqual([])
      expect(isBreakingChange(change)).toBe(false)
    })

    it('widening a function parameter with a union is additive', async () => {
      const existing = file('', `export declare function greet(_: string): void;`)
      const current = file('', `export declare function greet(_: string | number): void;`)
      const change = await analyzeApiChanges('index', existing, current)
      expect(change.widened).toEqual(['greet'])
      expect(isBreakingChange(change)).toBe(false)
    })

    it('widening a function return type with a union is additive', async () => {
      const existing = file('', `export declare function id(_: string): string;`)
      const current = file('', `export declare function id(_: string): string | number;`)
      const change = await analyzeApiChanges('index', existing, current)
      expect(change.widened).toEqual(['id'])
      expect(isBreakingChange(change)).toBe(false)
    })

    it('adding an extra parameter is additive', async () => {
      const existing = file(`export function greet(_) {}`, `export declare function greet(_: string): void;`)
      const current = file(`export function greet(_, _) {}`, `export declare function greet(_: string, _?: number): void;`)
      const change = await analyzeApiChanges('index', existing, current)
      expect(change.widened).toEqual(['greet'])
      expect(isBreakingChange(change)).toBe(false)
    })
  })

  describe('narrowing (breaking)', () => {
    it('removing an interface property is breaking', async () => {
      const existing = file('', `export interface Options {\n  a: string;\n  b: number;\n}`)
      const current = file('', `export interface Options {\n  a: string;\n}`)
      const change = await analyzeApiChanges('index', existing, current)
      expect(change.modified).toEqual(['Options'])
      expect(isBreakingChange(change)).toBe(true)
    })

    it('removing a union arm from a parameter is breaking', async () => {
      const existing = file('', `export declare function greet(_: string | number): void;`)
      const current = file('', `export declare function greet(_: string): void;`)
      const change = await analyzeApiChanges('index', existing, current)
      expect(change.modified).toEqual(['greet'])
      expect(isBreakingChange(change)).toBe(true)
    })
  })

  it('detects removed and added simultaneously', async () => {
    const existing = file('', `export interface A {\n  x: string;\n}`)
    const current = file('', `export interface B {\n  y: number;\n}`)
    const change = await analyzeApiChanges('index', existing, current)
    expect(change.removed).toEqual(['A'])
    expect(change.added).toEqual(['B'])
    expect(isBreakingChange(change)).toBe(true)
  })

  it('handles the "no exports" placeholder and headers', async () => {
    const existing = file(
      `/**\n * Generated by tsnapi — public API snapshot of \`x\`\n */\n/* no exports */`,
      `/* no exports */`,
    )
    const current = file(
      `/**\n * Generated by tsnapi — public API snapshot of \`x\`\n */\n// #region Functions\nexport function greet(_) {}\n// #endregion`,
      `export declare function greet(_: string): string;`,
    )
    const change = await analyzeApiChanges('index', existing, current)
    expect(change.added).toEqual(['greet'])
    expect(isBreakingChange(change)).toBe(false)
  })

  it('is not fooled by region markers or reordering (categorized output)', async () => {
    const existing = file(
      `// #region Functions\nexport function a(_) {}\nexport function b(_) {}\n// #endregion`,
      ``,
    )
    // Same members, formatting-only difference (markers/order) — not breaking
    const current = file(
      `// #region Functions\nexport function b(_) {}\nexport function a(_) {}\n// #endregion`,
      ``,
    )
    const change = await analyzeApiChanges('index', existing, current)
    expect(isBreakingChange(change)).toBe(false)
    expect(change.removed).toEqual([])
    expect(change.modified).toEqual([])
  })
})

describe('formatBreakingChanges', () => {
  it('lists removed and narrowed members', () => {
    const message = formatBreakingChanges([
      { entryName: 'index', removed: ['old'], modified: ['changed'], widened: ['grew'], added: ['fresh'] },
    ])
    expect(message).toContain('Breaking API changes detected')
    expect(message).toContain('removed')
    expect(message).toContain('old')
    expect(message).toContain('narrowed')
    expect(message).toContain('changed')
    expect(message).toContain('--allow-breaking')
  })

  it('does not surface additive (widened/added) entries in the error', () => {
    const message = formatBreakingChanges([
      { entryName: 'index', removed: ['old'], modified: [], widened: ['grew'], added: ['fresh'] },
    ])
    expect(message).not.toContain('grew')
    expect(message).not.toContain('fresh')
  })

  it('omits purely additive entries', () => {
    const message = formatBreakingChanges([
      { entryName: 'index', removed: [], modified: [], widened: ['grew'], added: ['fresh'] },
    ])
    expect(message).not.toContain('index')
  })
})
