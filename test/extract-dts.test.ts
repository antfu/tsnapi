import { describe, expect, it } from 'vitest'
import { extractDts } from '../src/core/extract-dts.ts'

describe('extractDts', () => {
  it('extracts interface exports', () => {
    const code = `
export interface Options {
  entry: string[];
  outDir?: string;
  format?: 'esm' | 'cjs';
}
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Interfaces
      export interface Options {
        entry: string[];
        outDir?: string;
        format?: 'esm' | 'cjs';
      }
      "
    `)
  })

  it('extracts type alias exports', () => {
    const code = `
export type Format = 'esm' | 'cjs' | 'iife';
export type Entry = string | string[];
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Types
      export type Entry = string | string[];
      export type Format = 'esm' | 'cjs' | 'iife';
      "
    `)
  })

  it('extracts function declaration exports', () => {
    const code = `
export declare function build(config: BuildConfig, options?: Options): Promise<void>;
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Functions
      export declare function build(_: BuildConfig, _?: Options): Promise<void>;
      "
    `)
  })

  it('extracts variable exports', () => {
    const code = `
export declare const VERSION: string;
export declare const DEFAULT_CONFIG: Options;
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Variables
      export declare const DEFAULT_CONFIG: Options;
      export declare const VERSION: string;
      "
    `)
  })

  it('extracts enum exports', () => {
    const code = `
export declare enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Enums
      export declare enum LogLevel {
        Debug = 0,
        Info = 1,
        Warn = 2,
        Error = 3,
      }
      "
    `)
  })

  it('sorts exports alphabetically', () => {
    const code = `
export type Zebra = string;
export type Alpha = number;
export interface Middle {
  value: boolean;
}
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Interfaces
      export interface Middle {
        value: boolean;
      }

      // Types
      export type Alpha = number;
      export type Zebra = string;
      "
    `)
  })

  it('widens literal initializers to base types', () => {
    const code = `
declare const VERSION = "2.0.0";
declare const COUNT = 42;
declare const DEBUG = true;
declare const TYPED: string;
export { VERSION, COUNT, DEBUG, TYPED };
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Variables
      export declare const COUNT: number;
      export declare const DEBUG: boolean;
      export declare const TYPED: string;
      export declare const VERSION: string;
      "
    `)
  })

  it('resolves aliased export specifiers', () => {
    const code = `
interface _Options {
  outputDir?: string;
  update?: boolean;
}
declare function _build(config: _Options): Promise<void>;
export { _build as build, type _Options as Options };
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Interfaces
      export interface Options {
        outputDir?: string;
        update?: boolean;
      }

      // Functions
      export declare function build(_: _Options): Promise<void>;
      "
    `)
  })

  it('preserves re-exports from another module', () => {
    const code = `
export { foo, bar as baz } from './other.js';
export type { Foo, Bar as Baz } from './types.js';
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Re-exports
      export { foo, bar as baz } from './other.js';
      export type { Foo, Bar as Baz } from './types.js';
      "
    `)
  })

  it('resolves exports through chunk imports', () => {
    const entryCode = `
import { a as SnapshotFile, c as formatError } from "./index-abc123.d.mts";
export { SnapshotFile, formatError };
`
    const chunkCode = `
interface SnapshotFile {
  runtime: string;
  dts: string;
}
declare function formatMismatchError(mismatches: SnapshotMismatch[]): string;
export { SnapshotFile as a, formatMismatchError as c };
`
    const result = extractDts('index.d.mts', entryCode, {
      chunkSources: new Map([['./index-abc123.d.mts', chunkCode]]),
    })
    expect(result).toMatchInlineSnapshot(`
      "// Interfaces
      export interface SnapshotFile {
        runtime: string;
        dts: string;
      }

      // Functions
      export declare function formatError(_: SnapshotMismatch[]): string;
      "
    `)
  })

  it('handles export { X as default } with valid syntax', () => {
    const code = `
declare function rolldownPlugin(options?: ApiSnapshotOptions): { name: string };
export { rolldownPlugin as default };
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Default Export
      declare function _default(_?: ApiSnapshotOptions): { name: string };
      export default _default
      "
    `)
  })

  it('resolves export specifiers to non-exported declarations', () => {
    const code = `
interface ApiSnapshotOptions {
  outputDir?: string;
  update?: boolean;
}
declare function ApiSnapshot(options?: ApiSnapshotOptions): Plugin;
export { ApiSnapshot, type ApiSnapshotOptions };
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Interfaces
      export interface ApiSnapshotOptions {
        outputDir?: string;
        update?: boolean;
      }

      // Functions
      export declare function ApiSnapshot(_?: ApiSnapshotOptions): Plugin;
      "
    `)
  })

  it('preserves argument names when omitArgumentNames is false', () => {
    const code = `
export declare function build(config: BuildConfig, options?: Options): Promise<void>;
`
    const result = extractDts('test.d.mts', code, { omitArgumentNames: false })
    expect(result).toMatchInlineSnapshot(`
      "// Functions
      export declare function build(config: BuildConfig, options?: Options): Promise<void>;
      "
    `)
  })

  it('replaces argument names with _ by default', () => {
    const code = `
export declare function build(config: BuildConfig, options?: Options): Promise<void>;
`
    const result = extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// Functions
      export declare function build(_: BuildConfig, _?: Options): Promise<void>;
      "
    `)
  })
})
