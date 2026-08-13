<script setup lang="ts">
import type { TreeDatum } from '../tree.ts'
import type { DiffStatus } from '../types.ts'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayKeyValue from '@antfu/design/components/Display/DisplayKeyValue.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackTip from '@antfu/design/components/Feedback/FeedbackTip.vue'
import { computed, ref, watch } from 'vue'
import { ALL_STATUSES, KIND_ICON, KIND_LABEL, SOURCE_META, sourceOf, STATUS_HEX, STATUS_STYLE } from '../kind.ts'

const props = defineProps<{ datum: TreeDatum | null, isDiff: boolean, dark?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const member = computed(() => (props.datum?.type === 'member' ? props.datum.member ?? null : null))

interface SurfaceBlock {
  surface: 'dts' | 'runtime'
  label: string
  changed: boolean
  /** Inline (unified) diff HTML from @pierre/diffs, for a changed surface. */
  diffHtml?: string
  /** Shiki-highlighted signature, for an unchanged / single-state surface. */
  singleHtml?: string
}

const blocks = ref<SurfaceBlock[]>([])

// Re-render when the selection or the theme changes (the inline diff bakes the
// active theme colours, so a light/dark toggle must re-generate it).
watch(() => [props.datum, props.dark] as const, async ([d]) => {
  blocks.value = []
  const m = d?.type === 'member' ? d.member : null
  if (!m)
    return

  // Lazy-load the highlighter + diff engine so they stay out of the initial bundle.
  const [{ highlightTs }, { renderInlineDiff }] = await Promise.all([
    import('../highlighter.ts'),
    import('../pierre.ts'),
  ])

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
      result.push({ surface, label, changed: true, diffHtml: await renderInlineDiff(before, after, props.dark ?? true) })
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
      'unbuilt': 'dist not built, showing committed snapshot. Run your build then Re-extract.',
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
  <div v-if="datum" class="panel bottom-3 right-3 top-3 absolute flex flex-col w-[440px] max-w-[85vw] z-panel-content">
    <!-- member header -->
    <header v-if="member" class="px-3 py-2 border-b border-base flex gap-2 items-center">
      <span class="text-lg" :class="[KIND_ICON[member.kind], STATUS_STYLE[member.status].text]" />
      <div class="min-w-0 flex-1">
        <div class="font-mono text-sm truncate">
          {{ member.display }}
        </div>
        <div class="text-micro op-fade flex gap-1.5 items-center">
          {{ KIND_LABEL[member.kind] }}
          <span v-if="member.referenced">· internal</span>
          <span class="flex gap-0.5 items-center" :title="SOURCE_META[sourceOf(member)].label">
            · <span :class="SOURCE_META[sourceOf(member)].icon" /> {{ SOURCE_META[sourceOf(member)].label }}
          </span>
        </div>
      </div>
      <DisplayBadge
        v-if="isDiff"
        class="shrink-0 text-xs"
        :color="STATUS_HEX[member.status]"
        :icon="STATUS_STYLE[member.status].icon"
        :text="STATUS_STYLE[member.status].label"
      />
      <ActionIconButton icon="i-ph-x" tooltip="Close" compact @click="emit('close')" />
    </header>

    <!-- package / entry / group header -->
    <header v-else-if="summary" class="px-3 py-2 border-b border-base flex gap-2 items-center">
      <span class="text-lg" :class="datum.type === 'package' ? 'i-ph-package color-active' : datum.type === 'group' ? 'i-ph-folders' : 'i-ph-door-open'" />
      <div class="min-w-0 flex-1">
        <div class="font-mono text-sm truncate">
          {{ summary.title }}
        </div>
        <div class="text-micro op-fade">
          {{ summary.sub }}
        </div>
      </div>
      <ActionIconButton icon="i-ph-x" tooltip="Close" compact @click="emit('close')" />
    </header>

    <!-- member body: Shiki-highlighted signatures / diff -->
    <div v-if="member" class="p-3 flex-1 overflow-auto space-y-4">
      <section v-for="b in blocks" :key="b.surface">
        <div class="text-micro tracking-wide color-faint mb-1 uppercase">
          {{ b.label }}
        </div>
        <div
          v-if="b.changed"
          class="pierre-host border border-base rounded overflow-hidden"
          v-html="b.diffHtml"
        />
        <div v-else v-html="b.singleHtml" />
      </section>
      <FeedbackEmptyState v-if="!blocks.length" icon="i-ph-code" title="No signature captured" />
    </div>

    <!-- package / entry / group body: status summary -->
    <div v-else-if="summary" class="p-3 flex-1 overflow-auto space-y-3">
      <FeedbackTip v-if="summary.note" type="warning" icon="i-ph-warning-circle">
        {{ summary.note }}
      </FeedbackTip>
      <div class="border border-base rounded-lg overflow-hidden">
        <DisplayKeyValue
          v-for="s in ALL_STATUSES" :key="s"
          class="px-3 py-2"
          :value="summary.counts[s]"
        >
          <template #label>
            <span class="flex gap-1.5 items-center">
              <span class="h-2 w-2 rounded-full" :class="STATUS_STYLE[s].dot" />
              {{ STATUS_STYLE[s].label }}
            </span>
          </template>
        </DisplayKeyValue>
      </div>
    </div>
  </div>
</template>
