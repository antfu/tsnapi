<script setup lang="ts">
import type { DiffRow } from '../diff.ts'
import type { ThemedToken, TokenLines } from '../shiki.ts'
import { computed, ref, watch } from 'vue'
import { computeDiffRows } from '../diff.ts'
import { highlightToTokens } from '../shiki.ts'

// Unified, line-level diff of two TypeScript/JS signatures. The diff structure
// (old/new gutters, +/- markers) is computed locally; syntax highlighting for
// each side comes from the shiki wire service (see ../shiki.ts) and degrades to
// plain text when unavailable. Replaces the former @pierre/diffs renderer.
const props = withDefaults(defineProps<{ before: string, after: string, lang?: string }>(), { lang: 'typescript' })

const rows = computed<DiffRow[]>(() => computeDiffRows(props.before, props.after))
const oldTokens = ref<TokenLines | null>(null)
const newTokens = ref<TokenLines | null>(null)

async function highlight(): Promise<void> {
  oldTokens.value = null
  newTokens.value = null
  const [o, n] = await Promise.all([
    highlightToTokens(props.before, props.lang),
    highlightToTokens(props.after, props.lang),
  ])
  oldTokens.value = o
  newTokens.value = n
}

watch(() => [props.before, props.after], highlight, { immediate: true })

const MARKER: Record<DiffRow['kind'], string> = { context: ' ', add: '+', del: '-' }

/** The pre-tokenized line for a row, from whichever side it belongs to (or `null` → plain). */
function lineTokens(row: DiffRow): ThemedToken[] | null {
  if (row.kind === 'del')
    return row.oldIndex != null ? (oldTokens.value?.[row.oldIndex] ?? null) : null
  if (row.newIndex != null)
    return newTokens.value?.[row.newIndex] ?? null
  if (row.oldIndex != null)
    return oldTokens.value?.[row.oldIndex] ?? null
  return null
}
</script>

<template>
  <div class="tsnapi-code tsnapi-diff border border-base rounded overflow-auto">
    <div v-for="(row, i) in rows" :key="i" class="diff-line" :class="`diff-${row.kind}`">
      <span class="diff-gutter">{{ row.oldNo ?? '' }}</span>
      <span class="diff-gutter">{{ row.newNo ?? '' }}</span>
      <span class="diff-marker">{{ MARKER[row.kind] }}</span>
      <span class="diff-code">
        <template v-if="lineTokens(row)">
          <span v-for="(t, ti) in lineTokens(row)!" :key="ti" :style="t.htmlStyle">{{ t.content }}</span>
        </template>
        <template v-else>{{ row.text }}</template>
      </span>
    </div>
  </div>
</template>
