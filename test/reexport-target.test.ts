import type { PackageCtx } from '../src/ui/node/payload.ts'
import { describe, expect, it } from 'vitest'
import { resolveReExportTarget } from '../src/ui/node/payload.ts'

function ctx(over: Partial<PackageCtx> & { name: string }): PackageCtx {
  return { dir: over.name, relDir: over.name, outputDir: '__snapshots__/tsnapi', entryStems: [{ name: '.', stem: 'index' }], ...over }
}

const ctxs: PackageCtx[] = [
  ctx({ name: 'tsnapi' }),
  ctx({ name: '@scope/pkg-b', entryStems: [{ name: '.', stem: 'index' }, { name: './utils', stem: 'utils' }] }),
]

describe('resolveReExportTarget', () => {
  it('resolves a bare specifier matching a workspace package to its "." entry', () => {
    const target = resolveReExportTarget('tsnapi', ctxs)
    expect(target).toEqual({ specifier: 'tsnapi', packageName: 'tsnapi', entryName: '.' })
  })

  it('resolves a subpath specifier to a known entry', () => {
    const target = resolveReExportTarget('@scope/pkg-b/utils', ctxs)
    expect(target).toEqual({ specifier: '@scope/pkg-b/utils', packageName: '@scope/pkg-b', entryName: './utils' })
  })

  it('resolves the package but leaves entryName unset for an unknown subpath', () => {
    const target = resolveReExportTarget('@scope/pkg-b/nope', ctxs)
    expect(target).toEqual({ specifier: '@scope/pkg-b/nope', packageName: '@scope/pkg-b', entryName: undefined })
  })

  it('leaves relative specifiers unresolved', () => {
    const target = resolveReExportTarget('./utils.js', ctxs)
    expect(target).toEqual({ specifier: './utils.js' })
  })

  it('leaves external npm specifiers unresolved', () => {
    const target = resolveReExportTarget('lodash', ctxs)
    expect(target).toEqual({ specifier: 'lodash' })
  })
})
