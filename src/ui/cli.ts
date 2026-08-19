import process from 'node:process'
import { createCac } from 'devframe/adapters/cac'
import { createInspectorDevframe, WORKING_TREE } from './node/devframe.ts'

interface ParsedUiArgs {
  action: 'dev' | 'build'
  base: string
  compare: string
  port?: number
  allHistory: boolean
  /** Remaining args forwarded to devframe's cac (e.g. --outDir). */
  rest: string[]
}

/**
 * Parse the raw args after `tsnapi ui`. The first non-flag token selects the
 * action (`build`, else the live dev server). `--base` / `--compare` accept a
 * git ref/sha or the literal `working` (the default compare side).
 */
function parseUiArgs(argv: string[]): ParsedUiArgs {
  let action: 'dev' | 'build' = 'dev'
  let base = 'HEAD'
  let compare = WORKING_TREE
  let port: number | undefined
  let allHistory = false
  const rest: string[] = []

  const normalizeRef = (v: string): string => (v === 'working' || v === 'WORKING_TREE') ? WORKING_TREE : v

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === 'build' && action === 'dev' && !arg.startsWith('-')) {
      action = 'build'
    }
    else if (arg === '--base') {
      base = normalizeRef(argv[++i] ?? base)
    }
    else if (arg === '--compare') {
      compare = normalizeRef(argv[++i] ?? compare)
    }
    else if (arg === '--port' || arg === '-p') {
      port = Number(argv[++i])
    }
    else if (arg === '--all-history') {
      allHistory = true
    }
    else {
      rest.push(arg)
    }
  }

  // A build without an explicit compare defaults to a single-state bake
  // (compare === base) rather than the working tree.
  if (action === 'build' && !argv.includes('--compare'))
    compare = base

  return { action, base, compare, port, allHistory, rest }
}

/**
 * Entry point for `tsnapi ui [build] [flags]`. `version` (the tsnapi version)
 * is passed in by the caller so the UI module graph never imports the root
 * `package.json`; the SPA itself is fetched from the versioned
 * `tsnapi-inspector-assets` package (see `devframe.ts`), not a local dir.
 */
export async function runUi(argv: string[], version: string): Promise<void> {
  const parsed = parseUiArgs(argv)
  const cwd = process.cwd()

  const definition = createInspectorDevframe({
    version,
    cwd,
    defaultBase: parsed.base,
    defaultCompare: parsed.compare,
    port: parsed.port,
    allHistory: parsed.allHistory,
  })

  const handle = createCac(definition, { defaultPort: parsed.port ?? 4599 })
  // cac's `parse` drops the first two argv entries (node + script), so prepend
  // placeholders before the subcommand.
  await handle.parse(['node', 'tsnapi', parsed.action, ...parsed.rest])
}
