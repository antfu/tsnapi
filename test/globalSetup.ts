import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'tsdown'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

export async function setup(): Promise<void> {
  const fixtures = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  for (const fixture of fixtures) {
    const fixtureDir = join(FIXTURES_DIR, fixture)

    // Handle monorepo-style fixtures with nested packages
    const packagesDir = join(fixtureDir, 'packages')
    if (existsSync(packagesDir)) {
      const packages = readdirSync(packagesDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
      for (const pkg of packages) {
        const pkgDir = join(packagesDir, pkg)
        rmSync(join(pkgDir, 'dist'), { recursive: true, force: true })
        await build({ cwd: pkgDir, logLevel: 'silent' })
      }
      continue
    }

    rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })
    await build({ cwd: fixtureDir, logLevel: 'silent' })
  }
}
