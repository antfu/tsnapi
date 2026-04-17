import type { SnapshotExtensions, SnapshotMismatch } from './core/snapshot.ts'
import type { ApiSnapshotOptions } from './core/types.ts'
import { access, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { extractDts } from './core/extract-dts.ts'
import { extractRuntime } from './core/extract-runtime.ts'
import { resolveUpdateMode } from './core/index.ts'
import {
  compareSnapshots,
  formatMismatchError,
  generateHeader,
  readSnapshot,
  writeSnapshot,
} from './core/snapshot.ts'

const DTS_RE = /\.d\.[cm]?ts$/
const JS_EXT_RE = /\.[cm]?[jt]s$/
const HASH_RE = /-[\w-]{6,}$/

export default function rolldownPlugin(options: ApiSnapshotOptions = {}): {
  name: string
  generateBundle: { order: 'post', handler: (this: any, outputOptions: any, bundle: any) => Promise<void> }
} {
  const {
    outputDir = '__snapshots__/tsnapi',
    extensionRuntime = '.snapshot.js',
    extensionDts = '.snapshot.d.ts',
    header: showHeader = true,
    omitArgumentNames,
    typeWidening,
    categorizedExports,
    update,
  } = options

  const ext: SnapshotExtensions = { runtime: extensionRuntime, dts: extensionDts }
  const extractOptions = { omitArgumentNames, typeWidening, categorizedExports }

  return {
    name: 'tsnapi',
    generateBundle: {
      order: 'post' as const,
      async handler(outputOptions, bundle) {
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

        // Read package name for header
        let packageName = 'unknown'
        if (showHeader) {
          const pkgPath = join(projectRoot, 'package.json')
          try {
            await access(pkgPath)
            packageName = JSON.parse(await readFile(pkgPath, 'utf-8')).name ?? 'unknown'
          }
          catch {}
        }

        const mismatches: SnapshotMismatch[] = []

        for (const [stem, jsChunk] of jsChunks) {
          const dtsChunk = dtsChunks.get(stem)
          const runtime = await extractRuntime(jsChunk.fileName, jsChunk.code, { chunkSources: jsChunkSources, ...extractOptions })
          const dts = dtsChunk ? await extractDts(dtsChunk.fileName, dtsChunk.code, { chunkSources: dtsChunkSources, ...extractOptions }) : ''
          const header = showHeader ? generateHeader(packageName, stem === 'index' ? '.' : `./${stem}`) : undefined
          const current = { runtime, dts }
          const existing = await readSnapshot(resolvedOutputDir, stem, ext)

          if (!existing || shouldUpdate) {
            await writeSnapshot(resolvedOutputDir, stem, current, ext, header)
          }
          else {
            const mismatch = compareSnapshots(stem, existing, current)
            if (mismatch) {
              mismatches.push(mismatch)
              await writeSnapshot(resolvedOutputDir, stem, current, ext, header)
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

function entryNameFromFileName(fileName: string): string {
  return fileName
    .replace(DTS_RE, '')
    .replace(JS_EXT_RE, '')
    .replace(HASH_RE, '')
}
