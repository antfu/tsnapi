// Shared setup for the @pierre/diffs *client* components (`FileDiff` / `File`,
// used by PierreDiff.vue / PierreFile.vue). Kept in its own module so the diff
// engine can be lazy-loaded, keeping it out of the initial bundle.
//
// @pierre/diffs' shared highlighter resolves languages/themes asynchronously;
// `FileDiff.render()` / `File.render()` return `false` synchronously the
// first time (before the highlighter is ready) and only self-heal once a
// worker pool is attached. Without one, calling `preloadHighlighter()` first
// — so the highlighter is already warm by the time `.render()` runs — is the
// documented, reliable way to use them: https://diffs.com/docs#worker-pool.

export const VITESSE_THEME = { light: 'vitesse-light', dark: 'vitesse-dark' } as const

let preloaded: Promise<void> | undefined

/** Warm the shared @pierre/diffs highlighter with TypeScript + both vitesse themes, once. */
export async function preloadPierreHighlighter(): Promise<void> {
  if (!preloaded) {
    preloaded = import('@pierre/diffs').then(({ preloadHighlighter }) => preloadHighlighter({
      langs: ['typescript'],
      themes: [VITESSE_THEME.light, VITESSE_THEME.dark],
      // Pure-JS regex engine: no oniguruma wasm at runtime.
      preferredHighlighter: 'shiki-js',
    }))
  }
  return preloaded
}

export interface BasePierreOptions {
  disableLineNumbers: true
  disableFileHeader: true
  preferredHighlighter: 'shiki-js'
  theme: typeof VITESSE_THEME
  themeType: 'dark' | 'light'
}

/** Options shared by both the diff and single-file client components. */
export function basePierreOptions(dark: boolean): BasePierreOptions {
  return {
    disableLineNumbers: true,
    disableFileHeader: true,
    preferredHighlighter: 'shiki-js',
    theme: VITESSE_THEME,
    themeType: dark ? 'dark' : 'light',
  }
}
