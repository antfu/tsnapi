import { fileURLToPath } from 'node:url'
import { guardStaleBuild } from 'tsdown-stale-guard'
import { describePackagesApiSnapshots } from '../src/vitest.ts'

// tsnapi snapshots its own public API surface, dogfooding the Vitest
// integration. The package lives at the repo root, so we point at it directly
// rather than relying on workspace auto-discovery.
const packageRoot = fileURLToPath(new URL('..', import.meta.url))

describePackagesApiSnapshots({
  packages: [packageRoot],
  // Write to the repo-root `__snapshots__/tsnapi/` (resolved relative to this
  // test file), keeping the snapshots the README links to.
  outputDir: '../__snapshots__',
  async beforeEach({ packageRoot }) {
    // `describePackagesApiSnapshots` reads built dist files, so fail loudly if
    // the dist is out of sync with the source instead of snapshotting a stale
    // build. Run `pnpm build` (or `pnpm dev`) before the tests.
    await guardStaleBuild({ root: packageRoot })
  },
})
