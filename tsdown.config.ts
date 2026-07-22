import { defineConfig } from 'tsdown'
import { StaleGuardRecorder } from 'tsdown-stale-guard'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/rolldown.ts',
    'src/cli.ts',
    'src/vitest.ts',
  ],
  dts: true,
  exports: true,
  // Record a build-freshness hash so the API snapshot test can refuse to run
  // against a stale dist (see test/api.test.ts). tsnapi's own public API is
  // snapshotted via `describePackagesApiSnapshots` in the test suite rather
  // than the build-time plugin, so the two never fight over the same files.
  plugins: [StaleGuardRecorder()],
})
