export const VERSION = '1.0.0'
export const DEBUG = false

export function greet(name: string): string {
  return `Hello, ${name}!`
}

export async function fetchData(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, options)
}

export function* range(start: number, end: number): Generator<number> {
  for (let i = start; i < end; i++) {
    yield i
  }
}

export interface GreetOptions {
  prefix?: string
  suffix?: string
}

export type Formatter = (input: string) => string
