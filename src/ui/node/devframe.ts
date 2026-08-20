import type { DevframeDefinition, RemoteAssets } from 'devframe'
import type { PayloadRequest } from './types.ts'
import { defineDevframe, defineRpcFunction } from 'devframe'
import { buildPayload, buildRefs } from './payload.ts'
import { WORKING_TREE } from './types.ts'

/**
 * The inspector SPA is published as its own npm package and fetched on
 * demand (CDN back-proxy, cached locally) rather than bundled into the main
 * `tsnapi` tarball — keeping the install footprint small, since the SPA
 * (with its Shiki grammar bundles) dwarfs the library itself.
 *
 * Its version is kept in lockstep with `tsnapi`'s (the `release` script
 * bumps both), so the exact-version pointer always resolves to matching UI.
 */
const INSPECTOR_ASSETS_PACKAGE = 'tsnapi-inspector-assets'

export interface DevframeAppOptions {
  /** tsnapi version, threaded in from the CLI (kept out of the UI module graph). */
  version: string
  /** Directory to inspect (the target workspace). */
  cwd: string
  /** Default base ref for the initial view. */
  defaultBase: string
  /** Default compare ref for the initial view. */
  defaultCompare: string
  /** Port for the dev server. */
  port?: number
  /** Whether the ref/commit picker should list full history by default. */
  allHistory?: boolean
}

/** Client-visible metadata (also baked into static builds). */
export interface MetaPayload {
  cwd: string
  isStatic: boolean
  defaultBase: string
  defaultCompare: string
}

/**
 * Build the tsnapi Inspector devframe definition. The same definition powers
 * the live dev server (`tsnapi ui`) and the static build (`tsnapi ui build`).
 *
 * Every query is marked `snapshot: true`, so a `build` bakes the default
 * (working-tree / diff) view once and serves it as the fallback for any call.
 */
export function createInspectorDevframe(app: DevframeAppOptions): DevframeDefinition {
  // A locally-installed copy of the assets package (the workspace link in
  // this repo, or an explicit `npm i tsnapi-inspector-assets` for air-gapped
  // use) is served with zero network; otherwise files stream from jsDelivr
  // and are cached. The `importMetaUrl` below is the resolution base for that
  // locally-installed-copy fast path.
  const distDir: RemoteAssets = {
    package: INSPECTOR_ASSETS_PACKAGE,
    version: app.version,
  }

  return defineDevframe({
    id: 'tsnapi-inspector',
    name: 'tsnapi Inspector',
    version: app.version,
    packageName: 'tsnapi',
    importMetaUrl: import.meta.url,
    homepage: 'https://github.com/antfu/tsnapi#readme',
    description: 'Visualize and diff the public API surface of every package in a monorepo.',
    icon: 'ph:graph-duotone',
    // Server-side syntax highlighting: the SPA calls this shared wire service's
    // `code-to-tokens` RPC instead of bundling Shiki grammars/themes itself.
    // Resolved from `importMetaUrl` (tsnapi's own dependency). Only TS/JS
    // signatures are ever highlighted, so preload just those grammars.
    services: [
      { package: '@devframes/service-shiki', options: { langs: ['typescript', 'javascript'] } },
    ],
    cli: {
      command: 'tsnapi-inspector',
      distDir,
      port: app.port ?? 4599,
      // Trusted single-user localhost tool — skip the OTP gate.
      auth: false,
    },
    setup(ctx) {
      const isStatic = ctx.mode === 'build'

      ctx.rpc.register(defineRpcFunction({
        name: 'tsnapi:get-meta',
        type: 'query',
        jsonSerializable: true,
        snapshot: true,
        async handler(): Promise<MetaPayload> {
          return {
            cwd: app.cwd,
            isStatic,
            defaultBase: app.defaultBase,
            defaultCompare: app.defaultCompare,
          }
        },
      }))

      ctx.rpc.register(defineRpcFunction({
        name: 'tsnapi:get-payload',
        type: 'query',
        jsonSerializable: true,
        snapshot: true,
        async handler(req?: PayloadRequest) {
          return buildPayload(app.cwd, {
            base: req?.base ?? app.defaultBase,
            compare: req?.compare ?? app.defaultCompare,
          })
        },
      }))

      ctx.rpc.register(defineRpcFunction({
        name: 'tsnapi:get-refs',
        type: 'query',
        jsonSerializable: true,
        snapshot: true,
        async handler(opts?: { all?: boolean }) {
          return buildRefs(app.cwd, { all: opts?.all ?? app.allHistory })
        },
      }))
    },
  })
}

export { WORKING_TREE }
