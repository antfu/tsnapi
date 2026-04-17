import { describe, expect, it } from 'vitest'
import { extractRuntime } from '../src/core/extract-runtime.ts'

describe('extractRuntime', () => {
  it('extracts function exports with empty bodies', async () => {
    const code = `
export function hello(name) {
  return 'hello ' + name;
}

export async function fetchData(url, options) {
  const res = await fetch(url, options);
  return res.json();
}
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export async function fetchData(_, _) {}
      export function hello(_) {}
      // #endregion
      "
    `)
  })

  it('extracts variable exports without values', async () => {
    const code = `
export const VERSION = '1.0.0';
export const DEBUG = true;
export const COUNT = 42;
export const config = { foo: 'bar' };
export const items = [1, 2, 3];
export const computed = something();
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export var computed /* const */
      export var config /* const */
      export var COUNT /* const */
      export var DEBUG /* const */
      export var items /* const */
      export var VERSION /* const */
      // #endregion
      "
    `)
  })

  it('extracts class exports with method bodies', async () => {
    const code = `
export class MyService {
  constructor(config) {
    this.config = config;
  }
  async run(input) {
    return process(input);
  }
  static create(options) {
    return new MyService(options);
  }
  get name() {
    return this.config.name;
  }
}
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Classes
      export class MyService {
        constructor(_) {}
        async run(_) {}
        static create(_) {}
        get name() {}
      }
      // #endregion
      "
    `)
  })

  it('extracts re-exports', async () => {
    const code = `export { foo, bar as baz } from './other.js';`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Re-exports
      export { foo, bar as baz } from './other.js';
      // #endregion
      "
    `)
  })

  it('extracts default exports', async () => {
    const code = `
export default function main(args) {
  return run(args);
}
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Default Export
      export default function main(_) {}
      // #endregion
      "
    `)
  })

  it('sorts exports alphabetically', async () => {
    const code = `
export function zebra() {}
export function alpha() {}
export function middle() {}
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export function alpha() {}
      export function middle() {}
      export function zebra() {}
      // #endregion
      "
    `)
  })

  it('resolves local export specifiers to declarations', async () => {
    const code = `
function greet(name) {
  return 'hello ' + name;
}
const VERSION = '1.0.0';
class App {
  constructor(config) {
    this.config = config;
  }
  start() {
    console.log('started');
  }
}
export { App, VERSION, greet };
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Classes
      export class App {
        constructor(_) {}
        start() {}
      }
      // #endregion

      // #region Functions
      export function greet(_) {}
      // #endregion

      // #region Variables
      export var VERSION /* const */
      // #endregion
      "
    `)
  })

  it('recovers class from var X = class { ... } pattern', async () => {
    const code = `
var Logger = class {
  constructor(prefix) {
    this.prefix = prefix;
  }
  log(msg) {
    console.log(this.prefix + msg);
  }
  static create(opts) {
    return new Logger(opts);
  }
};
export { Logger };
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Classes
      export class Logger {
        constructor(_) {}
        log(_) {}
        static create(_) {}
      }
      // #endregion
      "
    `)
  })

  it('resolves aliased local exports to declarations', async () => {
    const code = `
function internalGreet(name) {
  return 'hello ' + name;
}
const _version = '1.0.0';
class _App {
  constructor(config) {
    this.config = config;
  }
  start() {
    console.log('started');
  }
}
export { _App as App, _version as VERSION, internalGreet as greet };
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Classes
      export class App {
        constructor(_) {}
        start() {}
      }
      // #endregion

      // #region Functions
      export function greet(_) {}
      // #endregion

      // #region Variables
      export var VERSION /* const */
      // #endregion
      "
    `)
  })

  it('handles aliased export without local declaration', async () => {
    const code = `
import { something } from './other.js';
export { something as publicName };
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Other
      export { something as publicName }
      // #endregion
      "
    `)
  })

  it('extracts re-exports from another module with aliases', async () => {
    const code = `export { default as MyLib, Options } from './lib.js';`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Re-exports
      export { default as MyLib, Options } from './lib.js';
      // #endregion
      "
    `)
  })

  it('resolves exports through chunk imports', async () => {
    const entryCode = `
import { a as resolveEntries, i as resolveDir } from "./core-abc123.mjs";
export { resolveDir, resolveEntries };
`
    const chunkCode = `
function resolvePackageEntries(cwd) {
  return [];
}
function resolvePackageDir(name, cwd) {
  return name;
}
export { resolvePackageEntries as a, resolvePackageDir as i };
`
    const result = await extractRuntime('index.mjs', entryCode, {
      chunkSources: new Map([['./core-abc123.mjs', chunkCode]]),
    })
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export function resolveDir(_, _) {}
      export function resolveEntries(_) {}
      // #endregion
      "
    `)
  })

  it('handles export { X as default } with valid syntax', async () => {
    const code = `
function rolldownPlugin(options) {
  return { name: 'test' };
}
export { rolldownPlugin as default };
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Default Export
      function _default(_) {}
      export default _default
      // #endregion
      "
    `)
  })

  it('handles export { X as default } for class', async () => {
    const code = `
var MyClass = class {
  constructor(config) {
    this.config = config;
  }
  run() {
    console.log('running');
  }
};
export { MyClass as default };
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Default Export
      class _default {
        constructor(_) {}
        run() {}
      }
      export default _default
      // #endregion
      "
    `)
  })

  it('recovers function from var X = function(...) pattern', async () => {
    const code = `
var compute = function(a, b) {
  return a + b;
};
export { compute };
`
    const result = await extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "// #region Functions
      export function compute(_, _) {}
      // #endregion
      "
    `)
  })

  it('preserves literal values when typeWidening is false', async () => {
    const code = `
export const VERSION = '1.0.0';
export const DEBUG = true;
export const COUNT = 42;
export const EMPTY = null;
export const BIG = 100n;
`
    const result = await extractRuntime('test.mjs', code, { typeWidening: false })
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export var BIG = 100n /* const */
      export var COUNT = 42 /* const */
      export var DEBUG = true /* const */
      export var EMPTY = null /* const */
      export var VERSION = '1.0.0' /* const */
      // #endregion
      "
    `)
  })

  it('strips non-literal values even when typeWidening is false', async () => {
    const code = `
export const config = createConfig();
export const obj = { foo: 'bar' };
export const computed = a + b;
`
    const result = await extractRuntime('test.mjs', code, { typeWidening: false })
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export var computed /* const */
      export var config /* const */
      export var obj /* const */
      // #endregion
      "
    `)
  })

  it('preserves array literals when typeWidening is false', async () => {
    const code = `
export const ITEMS = [1, 2, 3];
export const MIXED = [1, 'two', true];
`
    const result = await extractRuntime('test.mjs', code, { typeWidening: false })
    expect(result).toMatchInlineSnapshot(`
      "// #region Variables
      export var ITEMS = [1, 2, 3] /* const */
      export var MIXED = [1, 'two', true] /* const */
      // #endregion
      "
    `)
  })

  it('preserves argument names when omitArgumentNames is false', async () => {
    const code = `
export function greet(name) {
  return 'hello ' + name;
}
export class App {
  constructor(config) {
    this.config = config;
  }
  run(input, options) {
    return input;
  }
}
`
    const result = await extractRuntime('test.mjs', code, { omitArgumentNames: false })
    expect(result).toMatchInlineSnapshot(`
      "// #region Classes
      export class App {
        constructor(config) {}
        run(input, options) {}
      }
      // #endregion

      // #region Functions
      export function greet(name) {}
      // #endregion
      "
    `)
  })

  it('uses flat alphabetical when categorizedExports is false', async () => {
    const code = `
export const VERSION = '1.0.0';
export function greet(name) { return name; }
export class App {}
`
    const result = await extractRuntime('test.mjs', code, { categorizedExports: false })
    expect(result).toMatchInlineSnapshot(`
      "export class App {}
      export function greet(_) {}
      export var VERSION /* const */
      "
    `)
  })
})
