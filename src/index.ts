export {
  analyzeApiChanges,
  compareSnapshots,
  extractDts,
  extractRuntime,
  formatBreakingChanges,
  formatMismatchError,
  generateApiSnapshot,
  isBreakingChange,
  readSnapshot,
  resolvePackageEntries,
  resolvePackageEntriesSync,
  snapshotFiles,
  snapshotPackage,
  writeSnapshot,
} from './core/index.ts'

export type {
  ApiSnapshotOptions,
  BreakingChange,
  ResolvedEntry,
  SnapshotExtensions,
  SnapshotFile,
  SnapshotMismatch,
  SnapshotResult,
} from './core/index.ts'
