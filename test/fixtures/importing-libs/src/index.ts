import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface FileOptions {
  encoding?: BufferEncoding
  createDirs?: boolean
}

export function readFile(filePath: string, options?: FileOptions): string {
  const resolved = resolve(filePath)
  return readFileSync(resolved, { encoding: options?.encoding ?? 'utf-8' })
}

export function writeFile(filePath: string, content: string, options?: FileOptions): void {
  const resolved = resolve(filePath)
  writeFileSync(resolved, content, { encoding: options?.encoding ?? 'utf-8' })
}

export function fileExists(filePath: string): boolean {
  return existsSync(resolve(filePath))
}

export function joinPaths(...paths: string[]): string {
  return join(...paths)
}

export type PathLike = string | URL
