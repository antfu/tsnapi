import type { SnapshotExtensions, SnapshotMismatch } from './core/snapshot.ts'
import type { ApiSnapshotOptions } from './core/types.ts'
import { dirname, isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { createUnplugin } from 'unplugin'
import { extractDts } from './core/extract-dts.ts'
import { extractRuntime } from './core/extract-runtime.ts'
import {
  compareSnapshots,
  formatMismatchError,
  readSnapshot,
  writeSnapshot,
} from './core/snapshot.ts'

const DTS_RE = /\.d\.[cm]?ts$/
const JS_EXT_RE = /\.[cm]?[jt]s$/
const HASH_RE = /-[\w-]{6,}$/

function createPluginHooks(options: ApiSnapshotOptions = {}): {
  name: string
  generateBundle: { order: 'post', handler: (this: any, outputOptions: any, bundle: any) => void }
} {
  const {
    outputDir = '__snapshots__',
    runtimeExtension = '.api.snapshot.js',
    dtsExtension = '.api.snapshot.d.ts',
    update,
  } = options

  const ext: SnapshotExtensions = { runtime: runtimeExtension, dts: dtsExtension }

  return {
    name: 'tsnapi',
    generateBundle: {
      order: 'post' as const,
      handler(outputOptions, bundle) {
        const shouldUpdate = resolveUpdateMode(update)
        const projectRoot = outputOptions.dir
          ? dirname(resolve(outputOptions.dir))
          : process.cwd()
        const resolvedOutputDir = isAbsolute(outputDir)
          ? outputDir
          : resolve(projectRoot, outputDir)

        const jsChunks = new Map<string, { code: string, fileName: string }>()
        const dtsChunks = new Map<string, { code: string, fileName: string }>()

        // Build chunk source maps for resolving import-reexport patterns
        const jsChunkSources = new Map<string, string>()
        const dtsChunkSources = new Map<string, string>()

        for (const [fileName, chunk] of Object.entries(bundle) as [string, any][]) {
          if (chunk.type === 'asset')
            continue
          if (chunk.isEntry) {
            const stem = entryNameFromFileName(fileName)
            if (DTS_RE.test(fileName))
              dtsChunks.set(stem, { code: chunk.code, fileName })
            else
              jsChunks.set(stem, { code: chunk.code, fileName })
          }
          else {
            // Non-entry chunks: make available for import resolution
            if (DTS_RE.test(fileName)) {
              dtsChunkSources.set(`./${fileName}`, chunk.code)
              // DTS imports often reference chunks with .mjs extension instead of .d.mts
              const mjsPath = `./${fileName.replace(DTS_RE, '.mjs')}`
              dtsChunkSources.set(mjsPath, chunk.code)
            }
            else {
              jsChunkSources.set(`./${fileName}`, chunk.code)
            }
          }
        }

        const mismatches: SnapshotMismatch[] = []

        for (const [stem, jsChunk] of jsChunks) {
          const dtsChunk = dtsChunks.get(stem)
          const runtime = extractRuntime(jsChunk.fileName, jsChunk.code, jsChunkSources)
          const dts = dtsChunk ? extractDts(dtsChunk.fileName, dtsChunk.code, dtsChunkSources) : ''
          const current = { runtime, dts }
          const existing = readSnapshot(resolvedOutputDir, stem, ext)

          if (!existing || shouldUpdate) {
            writeSnapshot(resolvedOutputDir, stem, current, ext)
          }
          else {
            const mismatch = compareSnapshots(stem, existing, current)
            if (mismatch) {
              mismatches.push(mismatch)
              writeSnapshot(resolvedOutputDir, stem, current, ext)
            }
          }
        }

        if (mismatches.length > 0) {
          const message = formatMismatchError(mismatches, outputDir, ext)
          console.error(message)
          this.error('API snapshot mismatch detected. Run with --update-snapshot or -u to update.')
        }
      },
    },
  }
}

// unplugin for vite/webpack (uses writeBundle as a proxy)
export const unplugin = createUnplugin((_options: ApiSnapshotOptions = {}) => {
  // For bundlers that support generateBundle natively (rollup/rolldown/vite),
  // the shorthand exports below are preferred. This unplugin entry
  // re-exports the same factory for use in webpack/other bundlers.
  return {
    name: 'tsnapi',
  }
})

// Direct plugin factories for bundlers with generateBundle support
export function rolldownPlugin(options?: ApiSnapshotOptions): any {
  return createPluginHooks(options)
}

export function rollupPlugin(options?: ApiSnapshotOptions): any {
  return createPluginHooks(options)
}

export function vitePlugin(options?: ApiSnapshotOptions): any {
  return createPluginHooks(options)
}

function entryNameFromFileName(fileName: string): string {
  return fileName
    .replace(DTS_RE, '')
    .replace(JS_EXT_RE, '')
    .replace(HASH_RE, '')
}

function resolveUpdateMode(explicit?: boolean): boolean {
  if (explicit != null)
    return explicit
  const env = process.env.UPDATE_SNAPSHOT
  if (env === '1' || env === 'true')
    return true
  return process.argv.includes('--update-snapshot') || process.argv.includes('-u')
}

export default unplugin
