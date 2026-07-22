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

#### Breaking changes guard

When you update snapshots, `tsnapi` classifies the change as either **additive** or **breaking**. A breaking change **aborts the update without overwriting the snapshot**, so you can't silently ship a breaking API change with a routine `-u`:

```
Breaking API changes detected

  index
    - removed   createServer
    ~ narrowed  RequestOptions

  Refusing to update snapshots because the public API changed in a breaking way.
  If this is intentional, re-run with --allow-breaking (or set TSNAPI_ALLOW_BREAKING=1).
```

The check is deliberately **lossy** — it favours *not* blocking a change to avoid false positives, while reliably catching the important case: something being **removed**. A change is treated as breaking only when a declaration loses something. Purely additive changes are allowed straight through:

| Change | Classified as |
| --- | --- |
| Removing an export | breaking |
| Removing an interface member, parameter, or union arm | breaking |
| Replacing a type with an unrelated one (e.g. `string` → `number`) | breaking |
| Adding a new export | additive |
| Adding a new interface property | additive |
| Widening a parameter or return type with a union (e.g. `string` → `string \| number`) | additive |
| Adding a parameter | additive |

> Because the guard only checks that nothing was removed, some genuinely breaking changes (for instance, widening a *return* type, which callers may not expect) are intentionally allowed through to keep false positives low. A normal comparison build still fails on **any** change, so every change is always visible in your git diff regardless.

When the change really is intentional, opt out with the `--allow-breaking` CLI flag, the `TSNAPI_ALLOW_BREAKING=1` environment variable, or the `allowBreaking` plugin option:

```bash
tsnapi -u --allow-breaking
# or
UPDATE_SNAPSHOT=1 TSNAPI_ALLOW_BREAKING=1 tsdown
```

<!-- eslint-skip -->
```ts
plugins: [
  ApiSnapshot({ update: true, allowBreaking: true })
],
```

> **Note:** The guard only runs while updating. A normal comparison build still fails on **any** change (additive or breaking) so every change lands in your git diff.

### As a CLI

Snapshot any package's dist without a bundler:

```bash
# Snapshot the current package (reads package.json exports → parses dist files), which you need to run the build first to generate the dist
tsnapi

# Update snapshots when you intentionally change the API
tsnapi -u

# Allow a breaking API change (removed/changed export) while updating
tsnapi -u --allow-breaking
```

### With Vitest

`tsnapi/vitest` provides higher-level Vitest integration that uses [`toMatchFileSnapshot`](https://vitest.dev/guide/snapshot#file-snapshots) to store snapshots as individual files.

> **Note:** `tsnapi` reads built dist files, so make sure to build your packages before running the tests. We recommend updating your test script to build first:
>
> ```json
> {
>   "scripts": {
>     "test": "pnpm run build && vitest"
>   }
> }
> ```
>
> If you are using [`tsdown`](https://tsdown.dev), you can use [`tsdown-stale-guard`](https://github.com/antfu-collective/tsdown-stale-guard) to set up the build guard automatically.

#### Single package

```ts
// api.test.ts
import { fileURLToPath } from 'node:url'
import { snapshotApiPerEntry } from 'tsnapi/vitest'
import { describe } from 'vitest'

const dir = fileURLToPath(new URL('../packages/my-lib', import.meta.url))

describe('my-lib API', async () => {
  await snapshotApiPerEntry(dir)
})
```

This creates `it()` blocks for each entry point, asserting both runtime and DTS snapshots. Snapshot files are written to `__snapshots__/tsnapi/<package-name>/` relative to the test file. Run `vitest -u` to update snapshots when you intentionally change the API.

#### Breaking changes guard

The same [breaking changes guard](#breaking-changes-guard) applies here. Running `vitest -u` would normally overwrite the snapshot files unconditionally; `tsnapi` intercepts the update, classifies the change, and **fails the test without overwriting the snapshot** when an export was removed or narrowed:

```
Breaking API changes detected

  index
    - removed   parseConfig
```

Because Vitest's CLI rejects unknown flags, the `--allow-breaking` flag can't be passed through `vitest`. Opt out with the `TSNAPI_ALLOW_BREAKING=1` environment variable or the `allowBreaking` option instead:

```bash
# Allow a breaking API change while updating
TSNAPI_ALLOW_BREAKING=1 vitest -u
```

```ts
await snapshotApiPerEntry(dir, { allowBreaking: true })
// or, for monorepos
await describePackagesApiSnapshots({ allowBreaking: true })
```

> **Note:** The guard only runs while updating (`-u`). A normal comparison run already fails on **any** change (additive or breaking), so every change stays visible in your git diff.

#### Monorepo

For monorepos, `describePackagesApiSnapshots` creates a `describe()` block per package. When `packages` is omitted, it auto-discovers workspace packages from `pnpm-workspace.yaml` or the `workspaces` field in `package.json`:

```ts
// api.test.ts
import { describePackagesApiSnapshots } from 'tsnapi/vitest'

// Auto-discovers all workspace packages
await describePackagesApiSnapshots()
```

Or provide explicit package paths:

```ts
import { fileURLToPath } from 'node:url'
import { describePackagesApiSnapshots } from 'tsnapi/vitest'

await describePackagesApiSnapshots({
  packages: [
    fileURLToPath(new URL('../packages/core', import.meta.url)),
    fileURLToPath(new URL('../packages/utils', import.meta.url)),
  ],
})
```

`describePackagesApiSnapshots` accepts `filter`, `beforeEach`, and `afterEach` callbacks. Each receives a `PackageContext` object:

```ts
interface PackageContext {
  cwd: string // the input cwd
  workspaceRoot: string // the resolved workspace root
  packageRoot: string // absolute path to the package directory
  packageName: string // package name from package.json
  outputDir: string // snapshot output directory (relative to test file)
}
```

#### `filter`

Called for each discovered package. The context is mutable — modify any property to customize behavior. Return `false` to skip the package entirely:

```ts
import { describePackagesApiSnapshots } from 'tsnapi/vitest'

await describePackagesApiSnapshots({
  filter(ctx) {
    // Skip private packages
    if (ctx.packageName.startsWith('@internal/'))
      return false
    // Strip org scope from describe block name
    ctx.packageName = ctx.packageName.replace(/^@.*\//, '')
    // Customize snapshot output directory per package
    ctx.outputDir = `__snapshots__/${ctx.packageName}`
  },
})
```

#### `beforeEach` / `afterEach`

Lifecycle hooks registered inside each package's `describe` block via Vitest's `beforeEach`/`afterEach`. They receive the (possibly mutated) context:

```ts
import { describePackagesApiSnapshots } from 'tsnapi/vitest'

await describePackagesApiSnapshots({
  beforeEach({ packageRoot, packageName }) {
    console.log(`Testing ${packageName} at ${packageRoot}`)
  },
  afterEach({ packageName }) {
    console.log(`Done testing ${packageName}`)
  },
})
```

For example, if you use [`tsdown-stale-guard`](https://github.com/antfu-collective/tsdown-stale-guard), you can use the `beforeEach` hook to guard against stale builds — ensuring each package's dist is in sync with its source before running snapshot tests:

```ts
import { guardStaleBuild } from 'tsdown-stale-guard'
import { describePackagesApiSnapshots } from 'tsnapi/vitest'

await describePackagesApiSnapshots({
  async beforeEach({ packageRoot }) {
    // guard will throw if the build is stale to fail the test
    await guardStaleBuild({ root: packageRoot })
  },
})
```

Run `vitest -u` to update snapshots when you intentionally change the API.

#### Low-level

You can also use `generateApiSnapshot` directly with Vitest's built-in snapshot system:

```ts
// api.test.ts
import { generateApiSnapshot } from 'tsnapi'
import { expect, it } from 'vitest'

const api = await generateApiSnapshot(process.cwd())

it('runtime API', () => {
  expect(api['.'].runtime).toMatchInlineSnapshot()
})

it('type declarations', () => {
  expect(api['.'].dts).toMatchInlineSnapshot()
})
```

For packages with multiple entry points, each entry is keyed by its export path:

```ts
const api = await generateApiSnapshot(process.cwd())
expect(api['./utils'].runtime).toMatchSnapshot()
```

### As a library

```ts
import { snapshotPackage } from 'tsnapi'

// Snapshot current package
const result = await snapshotPackage(process.cwd())

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
  /** Omit argument names from function signatures. @default true */
  omitArgumentNames?: boolean
  /** Widen literal types to base types, hiding implementation details. @default true */
  typeWidening?: boolean
  /** How many hops of non-exported types reachable from exports to inline. @default 1 */
  traceDepth?: number
  /** Update mode. Auto-detected from --update-snapshot / -u / UPDATE_SNAPSHOT=1 */
  update?: boolean
  /**
   * Allow breaking API changes (removed or narrowed exports) while updating.
   * When false (default), a breaking change aborts the update without writing.
   * Additive changes (new exports/members, wider unions) are always allowed.
   * Auto-detected from --allow-breaking / TSNAPI_ALLOW_BREAKING=1
   * @default false
   */
  allowBreaking?: boolean
}
```

### `typeWidening`

When `typeWidening` is `true` (default), literal values are widened to hide implementation details:

- **Runtime**: `export const VERSION = '1.0.0'` → `export var VERSION /* const */`
- **DTS**: `declare const VERSION = "1.0.0"` → `export declare const VERSION: string;`

When `typeWidening` is `false`, literal values are preserved in the snapshot:

- **Runtime**: `export const VERSION = '1.0.0'` → `export var VERSION = '1.0.0' /* const */`
- **DTS**: `declare const VERSION = "1.0.0"` → `export declare const VERSION = "1.0.0";`

This applies to string, number, boolean, null, bigint, and array literals. Non-literal values (function calls, complex objects) are always stripped regardless of this setting.

### `traceDepth`

A bundled `.d.ts` keeps the declarations of internal types that public exports reference, but leaves them unexported. Given:

<!-- eslint-skip -->
```ts
type Options = { foo: string }; // not exported
export declare const config: Options;
```

the snapshot would otherwise only show `export declare const config: Options;` — the shape of `Options` is absent, so changing it wouldn't invalidate the snapshot even though it changes the public contract.

`traceDepth` controls how many hops of non-exported type references reachable from the exports are inlined into a dedicated `Referenced (internal)` region:

- `0` — trace nothing (only the exports themselves).
- `1` (**default**) — types named directly in an export's signature (e.g. `Options` above).
- `2`+ — also the types those types reference, transitively.

With the default `traceDepth: 1`, the snapshot becomes:

<!-- eslint-skip -->
```ts
// #region Variables
export declare const config: Options;
// #endregion

// #region Referenced (internal)
type Options = { foo: string };
// #endregion
```

Higher depths capture more of the contract but grow the snapshot and make it harder to review, so keep this small. Changes to inlined internal types participate in the [breaking changes guard](#breaking-changes-guard) just like exported members.

### Deprecations

Comments are stripped from snapshots, but `@deprecated` is part of the public contract. When a declaration has a `@deprecated` JSDoc/comment, a minimal `/** @deprecated */` marker is kept on the line above it:

<!-- eslint-skip -->
```ts
/** @deprecated */
export declare function tweet(_: string): string;
export declare function post(_: string): string;
```

The original message is dropped -- only the marker is surfaced, so adding or removing the tag shows up in the diff.

## Credits

This project is heavily inspired by:

- [rolldown-plugin-dts-snapshot](https://github.com/sxzz/rolldown-plugin-dts-snapshot) by [@sxzz](https://github.com/sxzz) -- DTS snapshot approach using AST parsing
- [vitest-package-exports](https://github.com/antfu/vitest-package-exports) by [@antfu](https://github.com/antfu) -- Concept of snapshotting package exports for regression detection

## License

[MIT](./LICENSE)
