import { describe, expect, it } from 'vitest'
import { computeDiffRows, toLines } from '../app/src/diff.ts'

describe('toLines', () => {
  it('splits and drops a single trailing newline', () => {
    expect(toLines('a\nb\n')).toEqual(['a', 'b'])
    expect(toLines('a\nb')).toEqual(['a', 'b'])
    expect(toLines('')).toEqual([''])
  })
})

describe('computeDiffRows', () => {
  it('marks an added line with a new-side number and index, no old-side', () => {
    const before = 'export interface O {\n  a?: string;\n}'
    const after = 'export interface O {\n  a?: string;\n  b?: number;\n}'
    const rows = computeDiffRows(before, after)

    const added = rows.filter(r => r.kind === 'add')
    expect(added.map(r => r.text)).toEqual(['  b?: number;'])
    expect(added[0].oldNo).toBeUndefined()
    expect(added[0].newNo).toBe(3)
    expect(added[0].newIndex).toBe(2)

    // context rows keep both gutters
    const ctx = rows.filter(r => r.kind === 'context')
    expect(ctx.every(r => r.oldNo != null && r.newNo != null)).toBe(true)
  })

  it('marks a removed line with an old-side number and index, no new-side', () => {
    const before = 'a\nb\nc'
    const after = 'a\nc'
    const rows = computeDiffRows(before, after)
    const del = rows.filter(r => r.kind === 'del')
    expect(del.map(r => r.text)).toEqual(['b'])
    expect(del[0].oldNo).toBe(2)
    expect(del[0].oldIndex).toBe(1)
    expect(del[0].newNo).toBeUndefined()
  })

  it('is all-context when identical', () => {
    const rows = computeDiffRows('x\ny', 'x\ny')
    expect(rows.every(r => r.kind === 'context')).toBe(true)
    expect(rows.map(r => r.text)).toEqual(['x', 'y'])
  })

  it('renders a full replacement as del rows then add rows', () => {
    const rows = computeDiffRows('old', 'new')
    expect(rows.map(r => [r.kind, r.text])).toEqual([
      ['del', 'old'],
      ['add', 'new'],
    ])
  })
})
