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

describe('sub-exports with per-entry hooks', () => {
  snapshotApiPerEntry(join(FIXTURES_DIR, 'sub-exports'), {
    outputDir: '__snapshots__/tsnapi-hooks',
    entryFilter: ({ entryName }) => entryName !== './utils',
    transformEntries: (entries, { surface }) => {
      if (surface !== 'dts')
        return
      for (const entry of entries) {
        if (entry.name === 'VERSION')
          entry.text = 'export declare const VERSION: string /* semver */;'
      }
    },
    transformSnapshot: ({ surface, content }) =>
      surface === 'runtime' ? `${content}\n/* transformed by hook */` : null,
  })
})
