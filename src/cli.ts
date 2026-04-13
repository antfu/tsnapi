#!/usr/bin/env node
import process from 'node:process'
import cac from 'cac'
import { version } from '../package.json'
import { snapshotPackage } from './core/index.ts'

const cli = cac('tsnapi')

cli
  .command('[dir]', 'Snapshot exported API and types for TypeScript libraries')
  .option('-u, --update', 'Update snapshots instead of comparing')
  .option('-o, --output-dir <dir>', 'Snapshot output directory (default: __snapshots__/tsnapi)')
  .action((dir: string | undefined, options: { update?: boolean, outputDir?: string }) => {
    const result = snapshotPackage(dir ?? process.cwd(), {
      outputDir: options.outputDir,
      update: options.update,
    })

    if (result.hasChanges) {
      if (result.diff)
        console.error(result.diff)
      process.exit(1)
    }
  })

cli.help()
cli.version(version)
cli.parse()
