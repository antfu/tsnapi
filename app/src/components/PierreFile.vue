<script setup lang="ts">
import type { File } from '@pierre/diffs'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// A single (non-diff) TypeScript signature, rendered via the @pierre/diffs
// *client* `File` component — the same engine/theme/chrome as `PierreDiff`
// (see that component), so unchanged members render identically to changed
// ones. See ../pierre.ts for why the highlighter is preloaded first.
//
// `dark` defaults true — see PierreDiff.vue for why `withDefaults` (not a
// `?? true` fallback) is required for a boolean prop.
const props = withDefaults(defineProps<{ code: string, dark?: boolean }>(), { dark: true })

const container = ref<HTMLElement>()
let instance: File | undefined
let disposed = false

async function mountAndRender(): Promise<void> {
  if (!container.value)
    return
  const [{ File: FileClass }, { preloadPierreHighlighter, basePierreOptions }] = await Promise.all([
    import('@pierre/diffs'),
    import('../pierre.ts'),
  ])
  await preloadPierreHighlighter()
  if (disposed || !container.value)
    return

  instance = new FileClass(basePierreOptions(props.dark))
  // See PierreDiff.vue: `containerWrapper` (not `fileContainer`) so the
  // component creates its own `<diffs-container>` custom element, which is
  // what adopts the core structural stylesheet.
  instance.render({
    containerWrapper: container.value,
    // Trailing newline suppresses the "No newline at end of file" marker.
    file: { name: 'signature.ts', contents: `${props.code}\n` },
  })
}

function update(): void {
  if (!instance)
    return
  instance.setThemeType(props.dark ? 'dark' : 'light')
  instance.render({ containerWrapper: container.value, file: { name: 'signature.ts', contents: `${props.code}\n` } })
}

onMounted(mountAndRender)
watch(() => props.code, update)
watch(() => props.dark, () => instance?.setThemeType(props.dark ? 'dark' : 'light'))
onBeforeUnmount(() => {
  disposed = true
  instance?.cleanUp()
})
</script>

<template>
  <div ref="container" class="pierre-host border border-base rounded overflow-hidden" />
</template>
