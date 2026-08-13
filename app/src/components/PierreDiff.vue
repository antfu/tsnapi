<script setup lang="ts">
import type { FileDiff } from '@pierre/diffs'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Unified, word-highlighted inline diff of two TypeScript signatures, rendered
// via the @pierre/diffs *client* `FileDiff` component (real DOM/shadow-DOM
// rendering — not the /ssr string preloader). See ../pierre.ts for why the
// highlighter is preloaded before the first render.
//
// `dark` defaults true. Vue casts an absent *boolean* prop to `false` (not
// `undefined`), so a plain `props.dark ?? true` fallback would silently never
// trigger — the default has to be declared via `withDefaults` instead.
const props = withDefaults(defineProps<{ before: string, after: string, dark?: boolean }>(), { dark: true })

const container = ref<HTMLElement>()
let instance: FileDiff | undefined
let disposed = false

async function mountAndRender(): Promise<void> {
  if (!container.value)
    return
  const [{ FileDiff: FileDiffClass }, { preloadPierreHighlighter, basePierreOptions }] = await Promise.all([
    import('@pierre/diffs'),
    import('../pierre.ts'),
  ])
  await preloadPierreHighlighter()
  if (disposed || !container.value)
    return

  instance = new FileDiffClass({
    ...basePierreOptions(props.dark),
    diffStyle: 'unified',
    diffIndicators: 'classic',
    lineDiffType: 'word',
    // Show every unmodified line in full — no "N unmodified lines" collapsed
    // hunk separator with an expand toggle.
    expandUnchanged: true,
  })
  // Pass `containerWrapper` (our own element), not `fileContainer`: without an
  // explicit fileContainer, the component creates its own `<diffs-container>`
  // custom element and appends it here. That custom element is what adopts
  // the library's core structural stylesheet (grid layout, line-number
  // hiding, diff indicators, …) in its constructor — a plain element we pass
  // as `fileContainer` ourselves never gets it, and renders unstyled.
  instance.render({
    containerWrapper: container.value,
    // Trailing newline suppresses the "No newline at end of file" marker.
    oldFile: { name: 'signature.ts', contents: `${props.before}\n` },
    newFile: { name: 'signature.ts', contents: `${props.after}\n` },
  })
}

function update(): void {
  if (!instance)
    return
  instance.setThemeType(props.dark ? 'dark' : 'light')
  instance.render({
    containerWrapper: container.value,
    oldFile: { name: 'signature.ts', contents: `${props.before}\n` },
    newFile: { name: 'signature.ts', contents: `${props.after}\n` },
  })
}

onMounted(mountAndRender)
watch(() => [props.before, props.after], update)
watch(() => props.dark, () => instance?.setThemeType(props.dark ? 'dark' : 'light'))
onBeforeUnmount(() => {
  disposed = true
  instance?.cleanUp()
})
</script>

<template>
  <div ref="container" class="pierre-host border border-base rounded overflow-hidden" />
</template>
