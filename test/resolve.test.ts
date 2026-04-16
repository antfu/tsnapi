import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePackageEntries } from '../src/core/resolve.ts'

const tempDirs: string[] = []

function createTempFixture(pkg: Record<string, any>, files?: string[]): string {
  const cwd = mkdtempSync(join(tmpdir(), 'tsnapi-resolve-'))
  tempDirs.push(cwd)
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2))
  if (files) {
    for (const file of files) {
      const abs = join(cwd, file)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, '')
    }
  }
  return cwd
}

afterEach(() => {
  for (const dir of tempDirs)
    rmSync(dir, { recursive: true, force: true })
  tempDirs.length = 0
})

describe('resolvePackageEntries', () => {
  it('resolves fallback main/module/types when exports is missing', async () => {
    const cwd = createTempFixture({
      name: 'fixture',
      module: './dist/index.mjs',
      types: './dist/index.d.ts',
    })

    expect(await resolvePackageEntries(cwd)).toEqual([
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.mjs'),
        dts: resolve(cwd, './dist/index.d.ts'),
      },
    ])
  })

  it('resolves string shorthand exports', async () => {
    const cwd = createTempFixture({
      name: 'fixture',
      exports: './dist/index.mjs',
    })

    expect(await resolvePackageEntries(cwd)).toEqual([
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.mjs'),
        dts: null,
      },
    ])
  })

  it('resolves top-level import + types into one entry', async () => {
    const cwd = createTempFixture({
      name: 'fixture',
      exports: {
        '.': {
          import: './dist/index.mjs',
          types: './dist/index.d.ts',
        },
      },
    })

    expect(await resolvePackageEntries(cwd)).toEqual([
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.mjs'),
        dts: resolve(cwd, './dist/index.d.ts'),
      },
    ])
  })

  it('resolves nested import/require conditions by taking the first matching runtime and types', async () => {
    const cwd = createTempFixture({
      name: 'fixture',
      exports: {
        '.': {
          import: {
            types: './dist/index.d.ts',
            default: './dist/index.js',
          },
          require: {
            types: './dist/index.d.cts',
            default: './dist/index.cjs',
          },
          types: './dist/index.d.ts',
          a: './dist/index.mjs',
        },
      },
    })

    expect(await resolvePackageEntries(cwd)).toEqual([
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.js'),
        dts: resolve(cwd, './dist/index.d.ts'),
      },
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.cjs'),
        dts: resolve(cwd, './dist/index.d.cts'),
      },
    ])
  })

  it('resolves require branch when import is missing', async () => {
    const cwd = createTempFixture({
      name: 'fixture',
      exports: {
        '.': {
          require: {
            types: './dist/index.d.cts',
            default: './dist/index.cjs',
          },
        },
      },
    })

    expect(await resolvePackageEntries(cwd)).toEqual([
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.cjs'),
        dts: resolve(cwd, './dist/index.d.cts'),
      },
    ])
  })

  it('resolves subpath exports and ignores package.json and wildcard', async () => {
    const cwd = createTempFixture({
      name: 'fixture',
      exports: {
        '.': {
          import: './dist/index.mjs',
          types: './dist/index.d.ts',
        },
        './utils': {
          import: './dist/utils.mjs',
          types: './dist/utils.d.ts',
        },
        './*': './dist/*.mjs',
        './package.json': './package.json',
      },
    })

    expect(await resolvePackageEntries(cwd)).toEqual([
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.mjs'),
        dts: resolve(cwd, './dist/index.d.ts'),
      },
      {
        name: './utils',
        runtime: resolve(cwd, './dist/utils.mjs'),
        dts: resolve(cwd, './dist/utils.d.ts'),
      },
    ])
  })

  it('resolves nested import/require conditions for multiple subpaths with both branches', async () => {
    const cwd = createTempFixture({
      name: 'fixture',
      exports: {
        '.': {
          import: {
            types: './dist/index.d.ts',
            default: './dist/index.js',
          },
          require: {
            types: './dist/index.d.cts',
            default: './dist/index.cjs',
          },
        },
        './utils': {
          import: {
            types: './dist/utils.d.ts',
            default: './dist/utils.js',
          },
          require: {
            types: './dist/utils.d.cts',
            default: './dist/utils.cjs',
          },
        },
        './*': './dist/*.mjs',
        './package.json': './package.json',
      },
    })

    expect(await resolvePackageEntries(cwd)).toEqual([
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.js'),
        dts: resolve(cwd, './dist/index.d.ts'),
      },
      {
        name: '.',
        runtime: resolve(cwd, './dist/index.cjs'),
        dts: resolve(cwd, './dist/index.d.cts'),
      },
      {
        name: './utils',
        runtime: resolve(cwd, './dist/utils.js'),
        dts: resolve(cwd, './dist/utils.d.ts'),
      },
      {
        name: './utils',
        runtime: resolve(cwd, './dist/utils.cjs'),
        dts: resolve(cwd, './dist/utils.d.cts'),
      },
    ])
  })

  describe('implicit dts resolution', () => {
    it('resolves .d.ts from string shorthand exports when file exists', async () => {
      const cwd = createTempFixture({
        name: 'fixture',
        exports: './dist/index.js',
      }, ['dist/index.d.ts'])

      expect(await resolvePackageEntries(cwd)).toEqual([
        {
          name: '.',
          runtime: resolve(cwd, './dist/index.js'),
          dts: resolve(cwd, './dist/index.d.ts'),
        },
      ])
    })

    it('resolves .d.mts from .mjs export when file exists', async () => {
      const cwd = createTempFixture({
        name: 'fixture',
        exports: {
          '.': {
            import: './dist/index.mjs',
          },
        },
      }, ['dist/index.d.mts'])

      expect(await resolvePackageEntries(cwd)).toEqual([
        {
          name: '.',
          runtime: resolve(cwd, './dist/index.mjs'),
          dts: resolve(cwd, './dist/index.d.mts'),
        },
      ])
    })

    it('falls back to .d.ts when .d.mts does not exist', async () => {
      const cwd = createTempFixture({
        name: 'fixture',
        exports: {
          '.': {
            import: './dist/index.mjs',
          },
        },
      }, ['dist/index.d.ts'])

      expect(await resolvePackageEntries(cwd)).toEqual([
        {
          name: '.',
          runtime: resolve(cwd, './dist/index.mjs'),
          dts: resolve(cwd, './dist/index.d.ts'),
        },
      ])
    })

    it('resolves .d.cts from .cjs export when file exists', async () => {
      const cwd = createTempFixture({
        name: 'fixture',
        exports: {
          '.': {
            require: './dist/index.cjs',
          },
        },
      }, ['dist/index.d.cts'])

      expect(await resolvePackageEntries(cwd)).toEqual([
        {
          name: '.',
          runtime: resolve(cwd, './dist/index.cjs'),
          dts: resolve(cwd, './dist/index.d.cts'),
        },
      ])
    })

    it('returns dts null when no declaration file exists on disk', async () => {
      const cwd = createTempFixture({
        name: 'fixture',
        exports: './dist/index.js',
      })

      expect(await resolvePackageEntries(cwd)).toEqual([
        {
          name: '.',
          runtime: resolve(cwd, './dist/index.js'),
          dts: null,
        },
      ])
    })

    it('resolves dts from legacy main/module fallback when no types field', async () => {
      const cwd = createTempFixture({
        name: 'fixture',
        module: './dist/index.mjs',
      }, ['dist/index.d.mts'])

      expect(await resolvePackageEntries(cwd)).toEqual([
        {
          name: '.',
          runtime: resolve(cwd, './dist/index.mjs'),
          dts: resolve(cwd, './dist/index.d.mts'),
        },
      ])
    })
  })
})
