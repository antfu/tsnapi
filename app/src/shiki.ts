import { client } from './rpc.ts'

// Server-side syntax highlighting via devframe's shared `@devframes/service-shiki`
// wire service — so the SPA no longer bundles Shiki grammars/themes. The
// service's `code-to-tokens` RPC returns dual-theme tokens (light colour
// inline + a `--shiki-dark` CSS var); `main.css` flips to the dark var under
// `.dark`. When the service isn't advertised (e.g. a static `ui build` export,
// which has no server), highlighting degrades to plain, un-highlighted text.

const CODE_TO_TOKENS = 'devframes:service:shiki:code-to-tokens'

/** One highlighted token: its text plus the inline dual-theme style object. */
export interface ThemedToken {
  content: string
  /** e.g. `{ color: '#111', '--shiki-dark': '#eee' }` — bound straight to `:style`. */
  htmlStyle?: Record<string, string>
}

/** Highlighted lines (`tokens[line][token]`), or `null` when the service is unavailable. */
export type TokenLines = ThemedToken[][]

/**
 * Tokenize `code` through the shiki service. Resolves to `null` (never throws)
 * when the service isn't reachable — connection down, static export, or the
 * host simply doesn't provide it — so callers render plain text instead.
 */
export async function highlightToTokens(code: string, lang = 'typescript'): Promise<TokenLines | null> {
  try {
    const c = await client()
    const res = await c.callOptional(CODE_TO_TOKENS, { code, lang })
    const tokens = res?.tokens as TokenLines | undefined
    return tokens ?? null
  }
  catch {
    return null
  }
}
