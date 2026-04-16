import { join } from 'node:path'
import { describePackagesApiSnapshots } from '../src/vitest.ts'

const MONOREPO_DIR = join(import.meta.dirname, 'fixtures', 'monorepo')

describePackagesApiSnapshots({
  cwd: MONOREPO_DIR,
})
