import type { DevframeDefinition } from 'devframe'
import type { PayloadRequest, UiExtractOptions } from './types.ts'
import { defineRpcFunction } from 'devframe'
import { defineDevframe } from 'devframe/types'
import { buildPayload, buildRefs } from './payload.ts'
import { DEFAULT_EXTRACT_OPTIONS, WORKING_TREE } from './types.ts'

export interface DevframeAppOptions {
  /** tsnapi version, threaded in from the CLI (kept out of the UI module graph). */
  version: string
  /** Directory to inspect (the target workspace). */
  cwd: string
  /** Built SPA directory served as the UI. */
  distDir?: string
  /** Default base ref for the initial view. */
  defaultBase: string
  /** Default compare ref for the initial view. */
  defaultCompare: string
  /** Extraction options baked into the default request. */
  options?: Partial<UiExtractOptions>
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
  options: UiExtractOptions
}

/**
 * Build the tsnapi Inspector devframe definition. The same definition powers
 * the live dev server (`tsnapi ui`) and the static build (`tsnapi ui build`).
 *
 * Every query is marked `snapshot: true`, so a `build` bakes the default
 * (working-tree / diff) view once and serves it as the fallback for any call.
 */
export function createInspectorDevframe(app: DevframeAppOptions): DevframeDefinition {
  const options: UiExtractOptions = { ...DEFAULT_EXTRACT_OPTIONS, ...app.options }

  return defineDevframe({
    id: 'tsnapi-inspector',
    name: 'tsnapi Inspector',
    version: app.version,
    packageName: 'tsnapi',
    homepage: 'https://github.com/antfu/tsnapi#readme',
    description: 'Visualize and diff the public API surface of every package in a monorepo.',
    icon: 'ph:graph-duotone',
    cli: {
      command: 'tsnapi-inspector',
      distDir: app.distDir,
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
            options,
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
            options: req?.options ?? options,
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
