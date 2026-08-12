<script setup lang="ts">
import type { TreeDatum } from '../tree.ts'
import type { DiffStatus } from '../types.ts'
import { computed, ref, watch } from 'vue'
import { ALL_STATUSES, KIND_ICON, KIND_LABEL, SOURCE_META, sourceOf, STATUS_STYLE } from '../kind.ts'

const props = defineProps<{ datum: TreeDatum | null, isDiff: boolean }>()
const emit = defineEmits<{ close: [] }>()

const member = computed(() => (props.datum?.type === 'member' ? props.datum.member ?? null : null))

interface SurfaceBlock {
  surface: 'dts' | 'runtime'
  label: string
  changed: boolean
  beforeHtml?: string
  afterHtml?: string
  singleHtml?: string
}

const blocks = ref<SurfaceBlock[]>([])

watch(() => props.datum, async (d) => {
  blocks.value = []
  const m = d?.type === 'member' ? d.member : null
  if (!m)
    return

  // Lazy-load Shiki so it stays out of the initial bundle.
  const { highlightTs } = await import('../highlighter.ts')

  const surfaces = [
    { surface: 'dts' as const, label: 'Type (.d.ts)' },
    { surface: 'runtime' as const, label: 'Runtime (.js)' },
  ]
  const result: SurfaceBlock[] = []
  for (const { surface, label } of surfaces) {
    const before = (m.base?.[surface] ?? '').trim()
    const after = (m.current?.[surface] ?? '').trim()
    if (!before && !after)
      continue

    const changed = props.isDiff && !!before && !!after && before !== after
    if (changed) {
      result.push({ surface, label, changed: true, beforeHtml: await highlightTs(before), afterHtml: await highlightTs(after) })
    }
    else {
      result.push({ surface, label, changed: false, singleHtml: await highlightTs(after || before) })
    }
  }

  // Guard against an out-of-order resolution when the selection changed mid-await.
  if (props.datum === d)
    blocks.value = result
}, { immediate: true })

// Aggregate status counts for a package / entry / group selection.
const summary = computed<{ title: string, sub?: string, note?: string, counts: Record<DiffStatus, number> } | null>(() => {
  const d = props.datum
  if (!d || d.type === 'member')
    return null

  if (d.type === 'package' && d.pkg) {
    const notes: Record<string, string> = {
      'unbuilt': 'dist not built — showing committed snapshot; run your build then Re-extract',
      'no-api': 'no public API entries resolved',
      'no-snapshot': 'no committed snapshot at this ref',
      'ok': '',
    }
    return { title: d.label, sub: d.pkg.dir, note: notes[d.pkg.status], counts: d.pkg.counts }
  }

  // entry / group: aggregate the member children
  const counts: Record<DiffStatus, number> = { added: 0, removed: 0, modified: 0, widened: 0, unchanged: 0 }
  const walk = (node: TreeDatum): void => {
    if (node.type === 'member' && node.member)
      counts[node.member.status]++
    node.children?.forEach(walk)
  }
  walk(d)
  return { title: d.label, sub: d.type === 'group' ? 'kind group' : 'entry', counts }
})
</script>

<template>
  <div v-if="datum" class="panel absolute right-3 top-3 bottom-3 w-[440px] max-w-[85vw] flex flex-col z-20">
    <!-- member header -->
    <header v-if="member" class="flex items-center gap-2 px-3 py-2 border-b border-base">
      <span :class="[KIND_ICON[member.kind], STATUS_STYLE[member.status].text]" />
      <div class="flex-1 min-w-0">
        <div class="font-mono text-sm truncate">
          {{ member.display }}
        </div>
        <div class="text-2.5 op-60 flex items-center gap-1.5">
          {{ KIND_LABEL[member.kind] }}
          <span v-if="member.referenced">· internal</span>
          <span class="flex items-center gap-0.5" :title="SOURCE_META[sourceOf(member)].label">
            · <span :class="SOURCE_META[sourceOf(member)].icon" /> {{ SOURCE_META[sourceOf(member)].label }}
          </span>
        </div>
      </div>
      <span
        v-if="isDiff"
        class="text-2.5 px-1.5 py-0.5 rounded border shrink-0"
        :class="[STATUS_STYLE[member.status].text, STATUS_STYLE[member.status].border]"
      >{{ STATUS_STYLE[member.status].label }}</span>
      <button class="btn !px-1.5 !py-1" title="Close" @click="emit('close')">
        <span class="i-ph-x" />
      </button>
    </header>

    <!-- package / entry / group header -->
    <header v-else-if="summary" class="flex items-center gap-2 px-3 py-2 border-b border-base">
      <span :class="datum.type === 'package' ? 'i-ph-package text-primary' : datum.type === 'group' ? 'i-ph-folders' : 'i-ph-door-open'" />
      <div class="flex-1 min-w-0">
        <div class="font-mono text-sm truncate">
          {{ summary.title }}
        </div>
        <div class="text-2.5 op-60">
          {{ summary.sub }}
        </div>
      </div>
      <button class="btn !px-1.5 !py-1" title="Close" @click="emit('close')">
        <span class="i-ph-x" />
      </button>
    </header>

    <!-- member body: Shiki-highlighted signatures / diff -->
    <div v-if="member" class="flex-1 overflow-auto p-3 space-y-4 text-xs">
      <section v-for="b in blocks" :key="b.surface">
        <div class="text-2.5 uppercase tracking-wide op-50 mb-1">
          {{ b.label }}
        </div>
        <template v-if="b.changed">
          <div class="text-2.5 op-60 mb-0.5 flex items-center gap-1">
            <span class="i-ph-minus text-red-500" /> before
          </div>
          <div class="rounded ring-1 ring-red-500/40 overflow-hidden mb-2" v-html="b.beforeHtml" />
          <div class="text-2.5 op-60 mb-0.5 flex items-center gap-1">
            <span class="i-ph-plus text-green-500" /> after
          </div>
          <div class="rounded ring-1 ring-green-500/40 overflow-hidden" v-html="b.afterHtml" />
        </template>
        <div v-else v-html="b.singleHtml" />
      </section>
      <p v-if="!blocks.length" class="op-60">
        No signature captured.
      </p>
    </div>

    <!-- package / entry / group body: status summary -->
    <div v-else-if="summary" class="flex-1 overflow-auto p-3 space-y-3 text-xs">
      <p v-if="summary.note" class="flex items-start gap-1.5 op-80 text-amber-500">
        <span class="i-ph-warning-circle mt-0.5 shrink-0" /> {{ summary.note }}
      </p>
      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="s in ALL_STATUSES" :key="s"
          class="flex items-center justify-between px-2 py-1.5 rounded border border-base"
        >
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full" :class="STATUS_STYLE[s].dot" />
            {{ STATUS_STYLE[s].label }}
          </span>
          <span class="font-mono op-70">{{ summary.counts[s] }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
