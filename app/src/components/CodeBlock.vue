<script setup lang="ts">
import type { TokenLines } from '../shiki.ts'
import { ref, watch } from 'vue'
import { toLines } from '../diff.ts'
import { highlightToTokens } from '../shiki.ts'

// A single (non-diff) TypeScript/JS signature, syntax-highlighted server-side
// via the shiki wire service (see ../shiki.ts). Falls back to plain,
// un-highlighted text when the service isn't available (e.g. a static export).
const props = withDefaults(defineProps<{ code: string, lang?: string }>(), { lang: 'typescript' })

const tokens = ref<TokenLines | null>(null)
const plainLines = ref<string[]>(toLines(props.code))

async function highlight(): Promise<void> {
  plainLines.value = toLines(props.code)
  tokens.value = null
  tokens.value = await highlightToTokens(props.code, props.lang)
}

watch(() => props.code, highlight, { immediate: true })
</script>

<template>
  <div class="tsnapi-code border border-base rounded overflow-auto">
    <template v-if="tokens">
      <div v-for="(line, i) in tokens" :key="i" class="code-line">
        <span v-for="(t, ti) in line" :key="ti" :style="t.htmlStyle">{{ t.content }}</span>
      </div>
    </template>
    <template v-else>
      <div v-for="(line, i) in plainLines" :key="i" class="code-line" v-text="line" />
    </template>
  </div>
</template>
