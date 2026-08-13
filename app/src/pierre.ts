// Inline (unified) diff rendering via @pierre/diffs (Shiki-based). Kept in its
// own module so it can be lazy-loaded, keeping the diff engine out of the
// initial bundle.

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
      diffStyle: 'unified',
      diffIndicators: 'classic',
      lineDiffType: 'word',
      disableLineNumbers: true,
      disableFileHeader: true,
      // Pure-JS regex engine: no oniguruma wasm at runtime.
      preferredHighlighter: 'shiki-js',
      theme: { light: 'vitesse-light', dark: 'vitesse-dark' },
      themeType: dark ? 'dark' : 'light',
    },
  })
}
