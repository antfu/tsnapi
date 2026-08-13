// Code + inline (unified) diff rendering via @pierre/diffs (Shiki-based).
// Kept in its own module so it can be lazy-loaded, keeping the diff engine out
// of the initial bundle. Both diff and single-signature blocks render through
// this module so the two share identical styling (fonts, theme, chrome) — see
// https://diffs.com/docs#styling.

interface BasePierreOptions {
  disableLineNumbers: true
  disableFileHeader: true
  preferredHighlighter: 'shiki-js'
  theme: { light: string, dark: string }
  themeType: 'dark' | 'light'
}

/** Options shared by both the diff and single-file renderers. */
function baseOptions(dark: boolean): BasePierreOptions {
  return {
    disableLineNumbers: true,
    disableFileHeader: true,
    // Pure-JS regex engine: no oniguruma wasm at runtime.
    preferredHighlighter: 'shiki-js' as const,
    theme: { light: 'vitesse-light', dark: 'vitesse-dark' },
    themeType: dark ? 'dark' as const : 'light' as const,
  }
}

/**
 * Render a unified, word-highlighted inline diff of two TypeScript signatures
 * as an HTML string (for `v-html`). `dark` selects the vitesse theme flavour.
 */
export async function renderInlineDiff(before: string, after: string, dark: boolean): Promise<string> {
  const { preloadDiffHTML } = await import('@pierre/diffs/ssr')
  // Trailing newline suppresses the "No newline at end of file" marker.
  return preloadDiffHTML({
    oldFile: { name: 'signature.ts', contents: `${before}\n` },
    newFile: { name: 'signature.ts', contents: `${after}\n` },
    options: {
      ...baseOptions(dark),
      diffStyle: 'unified',
      diffIndicators: 'classic',
      lineDiffType: 'word',
    },
  })
}

/**
 * Render a single (non-diff) TypeScript signature as an HTML string, through
 * the same @pierre/diffs renderer as {@link renderInlineDiff} — so unchanged
 * members get identical chrome/theme/typography to changed ones.
 */
export async function renderInlineFile(code: string, dark: boolean): Promise<string> {
  const { preloadFile } = await import('@pierre/diffs/ssr')
  const { prerenderedHTML } = await preloadFile({
    file: { name: 'signature.ts', contents: `${code}\n` },
    options: baseOptions(dark),
  })
  return prerenderedHTML
}
