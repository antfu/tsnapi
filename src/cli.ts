#!/usr/bin/env node
import process from 'node:process'
import { snapshotInstalledPackage, snapshotPackage } from './core/index.ts'

function main(): void {
  const args = process.argv.slice(2)
  const options: Record<string, string | boolean> = {}
  const positionals: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-u' || arg === '--update-snapshot' || arg === '--update') {
      options.update = true
    }
    else if (arg === '--output-dir' || arg === '-o') {
      options.outputDir = args[++i]
    }
    else if (arg === '--pkg' || arg === '-p') {
      options.pkg = args[++i]
    }
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      return
    }
    else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`)
      process.exit(1)
    }
    else {
      positionals.push(arg)
    }
  }

  const cwd = positionals[0] ? process.cwd() : process.cwd()
  const snapshotOptions = {
    outputDir: options.outputDir as string | undefined,
    update: options.update as boolean | undefined,
  }

  let result
  if (options.pkg) {
    result = snapshotInstalledPackage(options.pkg as string, cwd, snapshotOptions)
  }
  else {
    result = snapshotPackage(positionals[0] ?? cwd, snapshotOptions)
  }

  if (result.hasChanges) {
    if (result.diff)
      console.error(result.diff)
    process.exit(1)
  }
}

function printHelp(): void {
  console.log(`
  tsnapi - Snapshot exported API and types for TypeScript libraries

  Usage:
    tsnapi [dir]              Snapshot package at directory (default: cwd)
    tsnapi --pkg <name>       Snapshot an installed package

  Options:
    -u, --update-snapshot     Update snapshots instead of comparing
    -o, --output-dir <dir>    Snapshot output directory (default: __snapshots__)
    -p, --pkg <name>          Snapshot a package from node_modules
    -h, --help                Show this help
`.trim())
}

main()
