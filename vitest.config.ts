import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['test/globalSetup.ts'],
    // fixtures.test.ts cleans and rebuilds fixture dist directories,
    // so it must not run concurrently with vitest-integration.test.ts.
    fileParallelism: false,
  },
})
