<script setup lang="ts">
import type { MemberNode } from '../types.ts'
import { computed } from 'vue'
import { lineDiff } from '../diff.ts'
import { KIND_ICON, KIND_LABEL, STATUS_STYLE } from '../kind.ts'

const props = defineProps<{ member: MemberNode | null, isDiff: boolean }>()
const emit = defineEmits<{ close: [] }>()

const surfaces = ['dts', 'runtime'] as const

function surfaceText(side: 'base' | 'current', surface: 'dts' | 'runtime'): string {
  return (props.member?.[side]?.[surface] ?? '').trim()
}

const diffs = computed(() => {
  if (!props.member)
    return null
  return surfaces.map((surface) => {
    const before = surfaceText('base', surface)
    const after = surfaceText('current', surface)
    const changed = before !== after
    return { surface, before, after, changed, lines: changed ? lineDiff(before, after) : [] }
  }).filter(s => s.before || s.after)
})
</script>

<template>
  <div v-if="member" class="panel absolute right-3 top-3 bottom-3 w-[420px] max-w-[80vw] flex flex-col z-20">
    <header class="flex items-center gap-2 px-3 py-2 border-b border-base">
      <span :class="[KIND_ICON[member.kind], STATUS_STYLE[member.status].text]" />
      <div class="flex-1 min-w-0">
        <div class="font-mono text-sm truncate">
          {{ member.display }}
        </div>
        <div class="text-2.5 op-60">
          {{ KIND_LABEL[member.kind] }}<span v-if="member.referenced"> · internal</span>
        </div>
      </div>
      <span
        class="text-2.5 px-1.5 py-0.5 rounded border"
        :class="[STATUS_STYLE[member.status].text, STATUS_STYLE[member.status].border]"
      >{{ STATUS_STYLE[member.status].label }}</span>
      <button class="btn !px-1.5 !py-1" title="Close" @click="emit('close')">
        <span class="i-ph-x" />
      </button>
    </header>

    <div class="flex-1 overflow-auto p-3 space-y-4 text-xs font-mono leading-relaxed">
      <section v-for="s in diffs" :key="s.surface">
        <div class="text-2.5 uppercase tracking-wide op-50 mb-1 font-sans">
          {{ s.surface === 'dts' ? 'Type (.d.ts)' : 'Runtime (.js)' }}
        </div>

        <template v-if="isDiff && s.changed">
          <pre class="rounded bg-active/40 p-2 overflow-x-auto"><code><span
            v-for="(l, i) in s.lines" :key="i"
            class="block whitespace-pre"
            :class="{
              'bg-green-500/15 text-green-400': l.type === 'add',
              'bg-red-500/15 text-red-400': l.type === 'del',
            }"
          >{{ l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  ' }}{{ l.text }}</span></code></pre>
        </template>
        <template v-else>
          <pre class="rounded bg-active/40 p-2 overflow-x-auto"><code>{{ (s.after || s.before) }}</code></pre>
        </template>
      </section>

      <p v-if="!diffs || !diffs.length" class="op-60 font-sans">
        No signature captured.
      </p>
    </div>
  </div>
</template>
