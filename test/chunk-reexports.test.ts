import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateApiSnapshot } from '../src/core/index.ts'

// Hand-written dist output (committed under `lib/`, not built) mirroring the two
// forms rolldown emits for entries re-exporting a shared chunk:
//   rolldown <= 1.2.12: import { t as foo } from "./chunk.mjs"; export { foo }
//   rolldown >= 1.2.13: export { t as foo } from "./chunk.mjs"
// Both include an entry in a subfolder (`lib/node/index.mjs`) importing a chunk
// from the parent directory, and a chunk forwarding a binding from another chunk.
const FIXTURES_DIR = join(import.meta.dirname, 'fixtures', 'chunk-reexports')

describe('chunk re-exports', () => {
  it('resolves both rolldown output forms to the same snapshots', async () => {
    const imported = await generateApiSnapshot(join(FIXTURES_DIR, 'import'), { header: false })
    const reexported = await generateApiSnapshot(join(FIXTURES_DIR, 'reexport'), { header: false })
    expect(Object.keys(reexported).sort()).toEqual(['.', './node'])
    expect(reexported).toEqual(imported)
  })

  it('expands chunk re-exports and keeps external re-exports raw', async () => {
    const api = await generateApiSnapshot(join(FIXTURES_DIR, 'reexport'), { header: false })
    expect(api['.'].runtime).toMatchInlineSnapshot(`
      "// #region Functions
      export function createShared(_) {}
      export function defineThing(_, _) {}
      // #endregion

      // #region Variables
      export var SHARED_VERSION
      // #endregion

      // #region Default Export
      function _default(_) {}
      export default _default
      // #endregion

      // #region Re-exports
      export * from "some-external-pkg";
      // #endregion"
    `)
    expect(api['.'].dts).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface SharedOptions {
        name: string;
      }
      // #endregion

      // #region Functions
      export declare function createShared(_?: SharedOptions): { options: SharedOptions | undefined };
      export declare function defineThing(_: string, _: () => void): { name: string };
      // #endregion

      // #region Variables
      export declare const SHARED_VERSION: string;
      // #endregion

      // #region Default Export
      declare function _default(_?: SharedOptions): { options: SharedOptions | undefined };
      export default _default
      // #endregion

      // #region Re-exports
      export * from "some-external-pkg";
      // #endregion"
    `)
  })

  it('resolves chunks in a parent directory for a subfolder entry', async () => {
    const api = await generateApiSnapshot(join(FIXTURES_DIR, 'reexport'), { header: false })
    expect(api['./node'].runtime).toMatchInlineSnapshot(`
      "// #region Functions
      export function createNodeShared(_) {}
      // #endregion

      // #region Default Export
      function _default(_) {}
      export default _default
      // #endregion

      // #region Re-exports
      export { helper } from "some-external-pkg";
      // #endregion"
    `)
    expect(api['./node'].dts).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface SharedOptions {
        name: string;
      }
      // #endregion

      // #region Functions
      export declare function createNodeShared(_?: SharedOptions): { options: SharedOptions | undefined };
      // #endregion

      // #region Default Export
      declare function _default(_?: SharedOptions): { options: SharedOptions | undefined };
      export default _default
      // #endregion

      // #region Re-exports
      export { helper } from "some-external-pkg";
      // #endregion"
    `)
  })
})
