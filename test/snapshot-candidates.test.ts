import { describe, expect, it } from 'vitest'
import { snapshotCandidates } from '../src/ui/node/payload.ts'

describe('snapshotCandidates', () => {
  it('includes the CLI layout, nested inside the package\'s own directory', () => {
    const candidates = snapshotCandidates('packages/foo', '__snapshots__/tsnapi', 'foo', 'index', '.snapshot.js')
    expect(candidates).toContain('packages/foo/__snapshots__/tsnapi/index.snapshot.js')
  })

  it('includes the narrow vitest layout, nested inside the package\'s own directory', () => {
    const candidates = snapshotCandidates('packages/foo', '__snapshots__/tsnapi', 'foo', 'index', '.snapshot.js')
    expect(candidates).toContain('packages/foo/__snapshots__/tsnapi/foo/index.snapshot.js')
  })

  it('includes the workspace-root-relative vitest layout (a central test file at the workspace root, the README\'s own example)', () => {
    const candidates = snapshotCandidates('packages/foo', '__snapshots__/tsnapi', 'foo', 'index', '.snapshot.js')
    expect(candidates).toContain('__snapshots__/tsnapi/foo/index.snapshot.js')
  })

  it('includes common central-test-file directories (matching this repo\'s own vitest-monorepo.test.ts convention)', () => {
    const candidates = snapshotCandidates('packages/foo', '__snapshots__/tsnapi', 'foo', 'index', '.snapshot.js')
    expect(candidates).toContain('test/__snapshots__/tsnapi/foo/index.snapshot.js')
    expect(candidates).toContain('tests/__snapshots__/tsnapi/foo/index.snapshot.js')
    expect(candidates).toContain('__tests__/__snapshots__/tsnapi/foo/index.snapshot.js')
  })

  it('does not duplicate candidates when the package lives at the workspace root', () => {
    const candidates = snapshotCandidates('', '__snapshots__/tsnapi', 'foo', 'index', '.snapshot.js')
    const unique = new Set(candidates)
    expect(candidates.length).toBe(unique.size)
  })
})
