import { describe, expect, it } from 'vitest'
import { extractRuntime } from '../src/core/extract-runtime.ts'

describe('extractRuntime', () => {
  it('extracts function exports with empty bodies', () => {
    const code = `
export function hello(name) {
  return 'hello ' + name;
}

export async function fetchData(url, options) {
  const res = await fetch(url, options);
  return res.json();
}
`
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export async function fetchData(url, options) { /* ... */ }
      export function hello(name) { /* ... */ }
      "
    `)
  })

  it('extracts variable exports without values', () => {
    const code = `
export const VERSION = '1.0.0';
export const DEBUG = true;
export const COUNT = 42;
export const config = { foo: 'bar' };
export const items = [1, 2, 3];
export const computed = something();
`
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export var computed /* const */
      export var config /* const */
      export var COUNT /* const */
      export var DEBUG /* const */
      export var items /* const */
      export var VERSION /* const */
      "
    `)
  })

  it('extracts class exports with method bodies', () => {
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
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export class MyService {
        constructor(config) { /* ... */ }
        async run(input) { /* ... */ }
        static create(options) { /* ... */ }
        get name() { /* ... */ }
      }
      "
    `)
  })

  it('extracts re-exports', () => {
    const code = `export { foo, bar as baz } from './other.js';`
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export { foo, bar as baz } from './other.js';
      "
    `)
  })

  it('extracts default exports', () => {
    const code = `
export default function main(args) {
  return run(args);
}
`
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export default function main(args) { /* ... */ }
      "
    `)
  })

  it('sorts exports alphabetically', () => {
    const code = `
export function zebra() {}
export function alpha() {}
export function middle() {}
`
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export function alpha() { /* ... */ }
      export function middle() { /* ... */ }
      export function zebra() { /* ... */ }
      "
    `)
  })

  it('resolves local export specifiers to declarations', () => {
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
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export class App {
        constructor(config) { /* ... */ }
        start() { /* ... */ }
      }
      export function greet(name) { /* ... */ }
      export var VERSION /* const */
      "
    `)
  })

  it('recovers class from var X = class { ... } pattern', () => {
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
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export class Logger {
        constructor(prefix) { /* ... */ }
        log(msg) { /* ... */ }
        static create(opts) { /* ... */ }
      }
      "
    `)
  })

  it('recovers function from var X = function(...) pattern', () => {
    const code = `
var compute = function(a, b) {
  return a + b;
};
export { compute };
`
    const result = extractRuntime('test.mjs', code)
    expect(result).toMatchInlineSnapshot(`
      "export function compute(a, b) { /* ... */ }
      "
    `)
  })
})
