import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // fixtures.test.ts and vitest-integration.test.ts share fixture dist
    // directories, so they must not run concurrently.
    fileParallelism: false,
  },
})
