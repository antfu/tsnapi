import { describe, expect, it } from 'vitest'
import { extractDts } from '../src/core/extract-dts.ts'

describe('extractDts', () => {
  it('extracts interface exports', async () => {
    const code = `
export interface Options {
  entry: string[];
  outDir?: string;
  format?: 'esm' | 'cjs';
}
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface Options {
        entry: string[];
        outDir?: string;
        format?: 'esm' | 'cjs';
      }
      // #endregion
      "
    `)
  })

  it('extracts type alias exports', async () => {
    const code = `
export type Format = 'esm' | 'cjs' | 'iife';
export type Entry = string | string[];
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Types
      export type Entry = string | string[];
      export type Format = 'esm' | 'cjs' | 'iife';
      // #endregion
      "
    `)
  })

  it('extracts function declaration exports', async () => {
    const code = `
export declare function build(config: BuildConfig, options?: Options): Promise<void>;
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function build(_: BuildConfig, _?: Options): Promise<void>;
      // #endregion
      "
    `)
  })

  it('extracts variable exports', async () => {
    const code = `
export declare const VERSION: string;
export declare const DEFAULT_CONFIG: Options;
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export declare const DEFAULT_CONFIG: Options;
      export declare const VERSION: string;
      // #endregion
      "
    `)
  })

  it('extracts enum exports', async () => {
    const code = `
export declare enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Enums
      export declare enum LogLevel {
        Debug = 0,
        Info = 1,
        Warn = 2,
        Error = 3,
      }
      // #endregion
      "
    `)
  })

  it('sorts exports alphabetically', async () => {
    const code = `
export type Zebra = string;
export type Alpha = number;
export interface Middle {
  value: boolean;
}
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface Middle {
        value: boolean;
      }
      // #endregion

      // #region Types
      export type Alpha = number;
      export type Zebra = string;
      // #endregion
      "
    `)
  })

  it('widens literal initializers to base types', async () => {
    const code = `
declare const VERSION = "2.0.0";
declare const COUNT = 42;
declare const DEBUG = true;
declare const TYPED: string;
export { VERSION, COUNT, DEBUG, TYPED };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export declare const COUNT: number;
      export declare const DEBUG: boolean;
      export declare const TYPED: string;
      export declare const VERSION: string;
      // #endregion
      "
    `)
  })

  it('resolves aliased export specifiers', async () => {
    const code = `
interface _Options {
  outputDir?: string;
  update?: boolean;
}
declare function _build(config: _Options): Promise<void>;
export { _build as build, type _Options as Options };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface Options {
        outputDir?: string;
        update?: boolean;
      }
      // #endregion

      // #region Functions
      export declare function build(_: _Options): Promise<void>;
      // #endregion
      "
    `)
  })

  it('preserves re-exports from another module', async () => {
    const code = `
export { foo, bar as baz } from './other.js';
export type { Foo, Bar as Baz } from './types.js';
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Re-exports
      export { foo, bar as baz } from './other.js';
      export type { Foo, Bar as Baz } from './types.js';
      // #endregion
      "
    `)
  })

  it('resolves exports through chunk imports', async () => {
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
    const result = await extractDts('index.d.mts', entryCode, {
      chunkSources: new Map([['./index-abc123.d.mts', chunkCode]]),
    })
    expect(result).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface SnapshotFile {
        runtime: string;
        dts: string;
      }
      // #endregion

      // #region Functions
      export declare function formatError(_: SnapshotMismatch[]): string;
      // #endregion
      "
    `)
  })

  it('resolves chunk imports referenced with a ../-relative path', async () => {
    const entryCode = `
import { a as SnapshotFile } from "../engine-abc123.d.mts";
export { SnapshotFile };
`
    const chunkCode = `
interface SnapshotFile {
  runtime: string;
  dts: string;
}
export { SnapshotFile as a };
`
    const result = await extractDts('src/index.d.mts', entryCode, {
      chunkSources: new Map([['./engine-abc123.d.mts', chunkCode]]),
    })
    expect(result).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface SnapshotFile {
        runtime: string;
        dts: string;
      }
      // #endregion
      "
    `)
  })

  it('expands a re-exported local declare namespace', async () => {
    const code = `
declare namespace utils {
  function foo(a: number): string;
  const bar: number;
}
export { utils as Utils };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Namespaces
      export declare namespace Utils {
        function foo(_: number): string;
        const bar: number;
      }
      // #endregion
      "
    `)
  })

  it('handles export { X as default } with valid syntax', async () => {
    const code = `
declare function rolldownPlugin(options?: ApiSnapshotOptions): { name: string };
export { rolldownPlugin as default };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Default Export
      declare function _default(_?: ApiSnapshotOptions): { name: string };
      export default _default
      // #endregion
      "
    `)
  })

  it('resolves export specifiers to non-exported declarations', async () => {
    const code = `
interface ApiSnapshotOptions {
  outputDir?: string;
  update?: boolean;
}
declare function ApiSnapshot(options?: ApiSnapshotOptions): Plugin;
export { ApiSnapshot, type ApiSnapshotOptions };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface ApiSnapshotOptions {
        outputDir?: string;
        update?: boolean;
      }
      // #endregion

      // #region Functions
      export declare function ApiSnapshot(_?: ApiSnapshotOptions): Plugin;
      // #endregion
      "
    `)
  })

  it('preserves literal initializers when typeWidening is false', async () => {
    const code = `
declare const VERSION = "2.0.0";
declare const COUNT = 42;
declare const DEBUG = true;
declare const TYPED: string;
export { VERSION, COUNT, DEBUG, TYPED };
`
    const result = await extractDts('test.d.mts', code, { typeWidening: false })
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export declare const COUNT = 42;
      export declare const DEBUG = true;
      export declare const TYPED: string;
      export declare const VERSION = "2.0.0";
      // #endregion
      "
    `)
  })

  it('widens literal initializers by default (typeWidening: true)', async () => {
    const code = `
declare const VERSION = "2.0.0";
declare const COUNT = 42;
export { VERSION, COUNT };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export declare const COUNT: number;
      export declare const VERSION: string;
      // #endregion
      "
    `)
  })

  it('preserves argument names when omitArgumentNames is false', async () => {
    const code = `
export declare function build(config: BuildConfig, options?: Options): Promise<void>;
`
    const result = await extractDts('test.d.mts', code, { omitArgumentNames: false })
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function build(config: BuildConfig, options?: Options): Promise<void>;
      // #endregion
      "
    `)
  })

  it('handles string literals containing //', async () => {
    const code = `
export type ErrorMsg = "To learn more, see https://example.com/docs";
export declare const URL_PATTERN: "https://example.com/api";
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Types
      export type ErrorMsg = "To learn more, see https://example.com/docs";
      // #endregion

      // #region Variables
      export declare const URL_PATTERN: "https://example.com/api";
      // #endregion
      "
    `)
  })

  it('strips line comments via AST', async () => {
    const code = `
// This is a line comment
export type Foo = string;
export declare const bar: number; // trailing comment
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Types
      export type Foo = string;
      // #endregion

      // #region Variables
      export declare const bar: number;
      // #endregion
      "
    `)
  })

  it('strips block comments via AST', async () => {
    const code = `
/* block comment */
export type Foo = string;
/** JSDoc comment */
export interface Bar {
  /** field doc */
  baz: string;
}
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Interfaces
      export interface Bar {
        baz: string;
      }
      // #endregion

      // #region Types
      export type Foo = string;
      // #endregion
      "
    `)
  })

  it('preserves template literals containing //', async () => {
    const code = `
export type Protocol = \`https://\${string}\`;
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Types
      export type Protocol = \`https://\${string}\`;
      // #endregion
      "
    `)
  })

  it('replaces argument names with _ by default', async () => {
    const code = `
export declare function build(config: BuildConfig, options?: Options): Promise<void>;
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function build(_: BuildConfig, _?: Options): Promise<void>;
      // #endregion
      "
    `)
  })

  it('preserves this parameter in function declarations', async () => {
    const code = `
export declare function handler(this: Context, event: Event, data: string): void;
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function handler(this: Context, _: Event, _: string): void;
      // #endregion
      "
    `)
  })

  it('preserves this parameter in nested function types', async () => {
    const code = `
export declare function create(): {
  handler: (this: any, options: string, bundle: number) => void;
};
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function create(): {
        handler: (this: any, _: string, _: number) => void;
      };
      // #endregion
      "
    `)
  })

  it('preserves this parameter in class methods', async () => {
    const code = `
export declare class Emitter {
  emit(this: Emitter, event: string): void;
}
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Classes
      export declare class Emitter {
        emit(this: Emitter, _: string): void;
      }
      // #endregion
      "
    `)
  })

  it('preserves all overloads resolved through export specifier', async () => {
    const code = `
declare function foo(x: number): number;
declare function foo(x: string): string;
declare function foo(x: any): any;
export { foo };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function foo(_: number): number;
      export declare function foo(_: string): string;
      export declare function foo(_: any): any;
      // #endregion
      "
    `)
  })

  it('preserves all overloads with aliased export', async () => {
    const code = `
declare function _foo(x: number): number;
declare function _foo(x: string): string;
export { _foo as foo };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function foo(_: number): number;
      export declare function foo(_: string): string;
      // #endregion
      "
    `)
  })

  it('preserves all overloads resolved through chunk imports', async () => {
    const entryCode = `
import { c as formatError } from "./index-abc123.d.mts";
export { formatError };
`
    const chunkCode = `
declare function formatMismatchError(code: number): string;
declare function formatMismatchError(message: string): string;
export { formatMismatchError as c };
`
    const result = await extractDts('index.d.mts', entryCode, {
      chunkSources: new Map([['./index-abc123.d.mts', chunkCode]]),
    })
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function formatError(_: number): string;
      export declare function formatError(_: string): string;
      // #endregion
      "
    `)
  })

  it('preserves all overloads when written directly as export declare function', async () => {
    const code = `
export declare function bar(x: number): number;
export declare function bar(x: string): string;
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function bar(_: number): number;
      export declare function bar(_: string): string;
      // #endregion
      "
    `)
  })

  it('keeps overloads grouped alongside non-overloaded functions', async () => {
    const code = `
declare function foo(x: number): number;
declare function foo(x: string): string;
declare function baz(): void;
export { foo, baz };
`
    const result = await extractDts('test.d.mts', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export declare function baz(): void;
      export declare function foo(_: number): number;
      export declare function foo(_: string): string;
      // #endregion
      "
    `)
  })
})
