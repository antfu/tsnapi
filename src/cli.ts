#!/usr/bin/env node
import process from 'node:process'
import cac from 'cac'
import { version } from '../package.json'
import { snapshotPackage } from './core/index.ts'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  // `tsnapi ui [build]` launches the interactive API inspector (devframe SPA).
  // Delegated before cac parsing so the inspector owns its own flag surface and
  // the heavy UI dependencies load only when actually invoked. The dev server
  // keeps the process alive via its own open handles; `build` returns and the
  // process exits naturally.
  if (argv[0] === 'ui') {
    const { runUi } = await import('./ui/cli.ts')
    await runUi(argv.slice(1), version)
    return
  }

  const cli = cac('tsnapi')

  cli
    .command('[dir]', 'Snapshot exported API and types for TypeScript libraries')
    .option('-u, --update', 'Update snapshots instead of comparing')
    .option('--allow-breaking', 'Allow breaking API changes when updating snapshots')
    .option('-o, --output-dir <dir>', 'Snapshot output directory (default: __snapshots__/tsnapi)')
    .action(async (dir: string | undefined, options: { update?: boolean, allowBreaking?: boolean, outputDir?: string }) => {
      const result = await snapshotPackage(dir ?? process.cwd(), {
        outputDir: options.outputDir,
        update: options.update,
        allowBreaking: options.allowBreaking,
      })

      if (result.hasChanges) {
        if (result.diff)
          console.error(result.diff)
        process.exit(1)
      }
    })

  cli.command('ui [action]', 'Launch the interactive public-API inspector (use `ui build` for a static export)')
    .allowUnknownOptions()
    .action(() => {})

  cli.help()
  cli.version(version)
  cli.parse()
}

main()
