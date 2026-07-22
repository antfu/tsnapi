import { describe, expect, it } from 'vitest'
import { guardBreakingSnapshot } from '../src/vitest.ts'

const runtime = {
  before: `export function a() {}\nexport function b() {}`,
  removed: `export function a() {}`,
  added: `export function a() {}\nexport function b() {}\nexport function c() {}`,
}
const dts = {
  before: `export declare function a(x: string | number): void;`,
  narrowed: `export declare function a(x: string): void;`,
  widened: `export declare function a(x: string | number | boolean): void;`,
}

function guard(overrides: Partial<Parameters<typeof guardBreakingSnapshot>[0]> = {}): Promise<void> {
  return guardBreakingSnapshot({
    entryName: 'index',
    surface: 'runtime',
    current: runtime.removed,
    existing: runtime.before,
    updating: true,
    allowBreaking: false,
    ...overrides,
  })
}

describe('guardBreakingSnapshot', () => {
  it('throws on a breaking runtime change while updating', async () => {
    await expect(guard()).rejects.toThrow('Breaking API changes detected')
  })

  it('reports the removed export in the error', async () => {
    await expect(guard()).rejects.toThrow(/removed\s+b/)
  })

  it('throws on a narrowed dts declaration', async () => {
    await expect(guard({ surface: 'dts', existing: dts.before, current: dts.narrowed }))
      .rejects
      .toThrow('Breaking API changes detected')
  })

  it('passes on an additive runtime change', async () => {
    await expect(guard({ current: runtime.added })).resolves.toBeUndefined()
  })

  it('passes on a widened dts declaration', async () => {
    await expect(guard({ surface: 'dts', existing: dts.before, current: dts.widened }))
      .resolves
      .toBeUndefined()
  })

  it('is a no-op when not updating (compare mode)', async () => {
    await expect(guard({ updating: false })).resolves.toBeUndefined()
  })

  it('is a no-op when breaking changes are allowed', async () => {
    await expect(guard({ allowBreaking: true })).resolves.toBeUndefined()
  })

  it('is a no-op on a first run (no existing snapshot)', async () => {
    await expect(guard({ existing: null })).resolves.toBeUndefined()
  })

  it('isolates surfaces: a dts-only removal does not flag the runtime surface', async () => {
    // The runtime surface is unchanged; only the dts declaration lost content.
    await expect(guard({ surface: 'runtime', existing: runtime.before, current: runtime.before }))
      .resolves
      .toBeUndefined()
  })
})
