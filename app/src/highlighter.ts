import type { HighlighterCore } from 'shiki/core'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import ts from 'shiki/langs/typescript.mjs'
import vitesseDark from 'shiki/themes/vitesse-dark.mjs'
import vitesseLight from 'shiki/themes/vitesse-light.mjs'

let highlighterPromise: Promise<HighlighterCore> | undefined

// Fine-grained core highlighter: bundles only TypeScript + the two vitesse
// themes, using the pure-JS regex engine (no oniguruma wasm) — plenty accurate
// for TS signatures and far lighter than shiki's full grammar/wasm set.
function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [vitesseLight, vitesseDark],
      langs: [ts],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

/**
 * Highlight a TypeScript snippet as dual-theme HTML (vitesse-light /
 * vitesse-dark). The dark theme activates via `html.dark` (see main.css).
 */
export async function highlightTs(code: string): Promise<string> {
  const hl = await getHighlighter()
  return hl.codeToHtml(code.trim() || '/* empty */', {
    lang: 'typescript',
    themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
    defaultColor: false,
  })
}
