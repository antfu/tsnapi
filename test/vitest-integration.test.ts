import { join } from 'node:path'
import { describe } from 'vitest'
import { snapshotApiPerEntry } from '../src/vitest.ts'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

const fixtures = ['basic', 'sub-exports', 're-exports'] as const

for (const fixture of fixtures) {
  describe(fixture, () => {
    snapshotApiPerEntry(join(FIXTURES_DIR, fixture))
  })
}
