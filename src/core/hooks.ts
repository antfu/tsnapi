import type { Entry } from './kind.ts'
import type { ApiSnapshotOptions, SnapshotSurface } from './types.ts'

export interface EntryHooks {
  /** Whether an entry passes the user's `entryFilter`. */
  includeEntry: (entryName: string) => boolean
  /** Bind the user's `transformEntries` hook to one entry + surface, for `ExtractOptions`. */
  transformEntriesFor: (entryName: string, surface: SnapshotSurface) => ((entries: Entry[]) => Entry[] | null | void) | undefined
  /** Apply the user's `transformSnapshot` hook to generated content. */
  transformSnapshot: (entryName: string, surface: SnapshotSurface, content: string) => string
}

/**
 * Bind the per-entry hooks from {@link ApiSnapshotOptions} to a package, so
 * every integration (core, Vitest, rolldown) applies them identically.
 */
export function createEntryHooks(
  packageName: string,
  options?: Pick<ApiSnapshotOptions, 'entryFilter' | 'transformEntries' | 'transformSnapshot'>,
): EntryHooks {
  const { entryFilter, transformEntries, transformSnapshot } = options ?? {}
  return {
    includeEntry: entryName => entryFilter?.({ packageName, entryName }) !== false,
    transformEntriesFor: (entryName, surface) => transformEntries
      ? entries => transformEntries(entries, { packageName, entryName, surface })
      : undefined,
    transformSnapshot: (entryName, surface, content) =>
      transformSnapshot?.({ packageName, entryName, surface, content }) ?? content,
  }
}
