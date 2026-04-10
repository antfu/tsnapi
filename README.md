# tsnapi

<br>
<code>
&nbsp;t<b>s</b> <b>ap</b>i&nbsp;<br>
&nbsp;&nbsp;snap&nbsp;&nbsp;
</code>
<br><br>

Library public API snapshot testing for runtime exports and type declarations. 

Captures your public API surface -- both runtime exports and type declarations -- into human-readable snapshot files that you commit alongside your code. When the API changes unexpectedly, you'll know.

Think of it like Vitest's snapshot testing, but for your package's public contract.

## Why

When maintaining a library, it's easy to accidentally:

- Remove or rename an export
- Change a function signature
- Break type declarations
- Introduce unintended public API surface

`tsnapi` makes these changes visible in your git diff. Every build produces a pair of snapshot files per entry point:

- **`.api.snapshot.js`** -- what your package exports at runtime
- **`.api.snapshot.d.ts`** -- what your package exports as types

These files are committed to your repo. When they change, you review the diff -- just like any other code change.

## Install

```bash
npm i -D tsnapi
```

## Usage

### As a bundler plugin

`tsnapi` provides plugins for popular bundlers powered by [`unplugin`](https://github.com/unplugin/unplugin), which could work with all the major bundlers (Rollup, Vite, Webpack, esbuild, etc.).

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

On first build, snapshot files are written. On subsequent builds, the plugin compares against existing snapshots and **fails the build a diff** if the API changed.

To update snapshots when you intentionally change the API, set the `update` option to `true` or use the `--update-snapshot` / `-u` CLI flag:

```bash
tsdown --update-snapshot
# or
UPDATE_SNAPSHOT=1 tsdown
```

or add the `update` option to the plugin:

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

### As a library

```ts
import { snapshotPackage, snapshotInstalledPackage } from 'tsnapi'

// Snapshot current package
const result = snapshotPackage(process.cwd())

// Snapshot a dependency
const result = snapshotInstalledPackage('vue', process.cwd())

if (result.hasChanges) {
  console.error(result.diff)
}
```

## Options

```ts
interface ApiSnapshotOptions {
  /** Snapshot output directory. @default '__snapshots__' */
  outputDir?: string
  /** Runtime snapshot extension. @default '.api.snapshot.js' */
  runtimeExtension?: string
  /** DTS snapshot extension. @default '.api.snapshot.d.ts' */
  dtsExtension?: string
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
