<img src="./tsnapi.svg" alt="tsnapi" height="150" />

# tsnapi


Library public API snapshot testing for runtime exports and type declarations.

Captures your public API surface -- both runtime exports and type declarations -- into human-readable snapshot files that you commit alongside your code. When the API changes unexpectedly, you'll know.

Think of it like Vitest's snapshot testing, but for your package's public contract.

For example, you can check the generated snapshots for the package itself: [`__snapshots__/tsnapi`](/__snapshots__/tsnapi).

## Why

When maintaining a library, it's easy to accidentally:

- Remove or rename an export
- Change a function signature
- Break type declarations
- Introduce unintended public API surface

`tsnapi` makes these changes visible in your git diff. Every build produces a pair of snapshot files per entry point:

- **`.snapshot.js`** -- what your package exports at runtime
- **`.snapshot.d.ts`** -- what your package exports as types

These files are committed to your repo. When they change, you review the diff -- just like any other code change.

## Install

```bash
pnpm add -D tsnapi
```

## Usage

### As a Rolldown / tsdown plugin

The most recommended way of using `tsnapi` is to use it with [`tsdown`](https://tsdown.dev) -- an elegant library bundler built on top of Rolldown:

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown'
import ApiSnapshot from 'tsnapi/rolldown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [
    ApiSnapshot()
  ],
})
```

On first build, snapshot files are written. On subsequent builds, the plugin compares against existing snapshots and **fails the build with a diff** if the API changed.

To update snapshots when you intentionally change the API, set the `update` option to `true` or use the `--update-snapshot` / `-u` CLI flag:

```bash
tsdown --update-snapshot
# or
UPDATE_SNAPSHOT=1 tsdown
```

or add the `update` option to the plugin:

<!-- eslint-skip -->
```ts
plugins: [
  ApiSnapshot({ update: true })
],
```

### As a CLI

Snapshot any package's dist without a bundler:

```bash
# Snapshot the current package (reads package.json exports → parses dist files), which you need to run the build first to generate the dist
tsnapi

# Update snapshots when you intentionally change the API
tsnapi -u
```

### With Vitest

`tsnapi/vitest` provides higher-level Vitest integration that uses [`toMatchFileSnapshot`](https://vitest.dev/guide/snapshot#file-snapshots) to store snapshots as individual files.

> **Note:** `tsnapi` reads built dist files, so make sure to build your packages before running the tests. You can use a `globalSetup` in your Vitest config or a `beforeAll` hook to run the build first.

#### Single package

```ts
// api.test.ts
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { snapshotApiPerEntry } from 'tsnapi/vitest'
import { beforeAll, describe } from 'vitest'

const dir = fileURLToPath(new URL('../packages/my-lib', import.meta.url))

beforeAll(() => {
  execSync('pnpm build', { cwd: dir })
})

describe('my-lib API', () => {
  snapshotApiPerEntry(dir)
})
```

This creates `it()` blocks for each entry point, asserting both runtime and DTS snapshots. Snapshot files are written to `__snapshots__/tsnapi/<package-name>/` relative to the test file. Run `vitest -u` to update snapshots when you intentionally change the API.

#### Monorepo

For monorepos, `describePackagesApiSnapshots` creates a `describe()` block per package. When `packages` is omitted, it auto-discovers workspace packages from `pnpm-workspace.yaml` or the `workspaces` field in `package.json`:

```ts
// api.test.ts
import { execSync } from 'node:child_process'
import { describePackagesApiSnapshots } from 'tsnapi/vitest'
import { beforeAll } from 'vitest'

beforeAll(() => {
  execSync('pnpm -r build')
})

// Auto-discovers all workspace packages
describePackagesApiSnapshots()
```

Or provide explicit package paths:

```ts
import { fileURLToPath } from 'node:url'
import { describePackagesApiSnapshots } from 'tsnapi/vitest'

describePackagesApiSnapshots({
  packages: [
    fileURLToPath(new URL('../packages/core', import.meta.url)),
    fileURLToPath(new URL('../packages/utils', import.meta.url)),
  ],
})
```

Run `vitest -u` to update snapshots when you intentionally change the API.

#### Low-level

You can also use `generateApiSnapshot` directly with Vitest's built-in snapshot system:

```ts
// api.test.ts
import { generateApiSnapshot } from 'tsnapi'
import { expect, it } from 'vitest'

const api = generateApiSnapshot(process.cwd())

it('runtime API', () => {
  expect(api['.'].runtime).toMatchInlineSnapshot()
})

it('type declarations', () => {
  expect(api['.'].dts).toMatchInlineSnapshot()
})
```

For packages with multiple entry points, each entry is keyed by its export path:

```ts
const api = generateApiSnapshot(process.cwd())
expect(api['./utils'].runtime).toMatchSnapshot()
```

### As a library

```ts
import { snapshotPackage } from 'tsnapi'

// Snapshot current package
const result = snapshotPackage(process.cwd())

if (result.hasChanges) {
  console.error(result.diff)
}
```

## Options

```ts
interface ApiSnapshotOptions {
  /** Snapshot output directory. @default '__snapshots__/tsnapi' */
  outputDir?: string
  /** Runtime snapshot extension. @default '.snapshot.js' */
  extensionRuntime?: string
  /** DTS snapshot extension. @default '.snapshot.d.ts' */
  extensionDts?: string
  /** Update mode. Auto-detected from --update-snapshot / -u / UPDATE_SNAPSHOT=1 */
  update?: boolean
}
```

## Credits

This project is heavily inspired by:

- [rolldown-plugin-dts-snapshot](https://github.com/sxzz/rolldown-plugin-dts-snapshot) by [@sxzz](https://github.com/sxzz) -- DTS snapshot approach using AST parsing
- [vitest-package-exports](https://github.com/antfu/vitest-package-exports) by [@antfu](https://github.com/antfu) -- Concept of snapshotting package exports for regression detection

## License

[MIT](./LICENSE)
