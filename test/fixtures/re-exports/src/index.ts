// Aliased re-exports: internal names mapped to public API names
export {
  InternalService as Service,
  internalProcess as process,
  type InternalOptions as Options,
  INTERNAL_VERSION as VERSION,
} from './internal.ts'

// Re-exports from helpers (preserving names)
export { formatOutput, type Formatter } from './helpers.ts'
