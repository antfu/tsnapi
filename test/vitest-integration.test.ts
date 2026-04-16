import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'tsdown'
import { beforeAll, describe } from 'vitest'
import { snapshotApiPerEntry } from '../src/vitest.ts'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

async function buildFixture(fixture: string): Promise<void> {
  const fixtureDir = join(FIXTURES_DIR, fixture)
  rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })
  await build({ cwd: fixtureDir, logLevel: 'silent' })
}

const fixtures = ['basic', 'sub-exports', 're-exports'] as const

beforeAll(async () => {
  await Promise.all(fixtures.map(f => buildFixture(f)))
})

for (const fixture of fixtures) {
  describe(fixture, () => {
    snapshotApiPerEntry(join(FIXTURES_DIR, fixture))
  })
}
