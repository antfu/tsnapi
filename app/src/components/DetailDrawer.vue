<script setup lang="ts">
import type { TreeDatum } from '../tree.ts'
import type { DiffStatus } from '../types.ts'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayKeyValue from '@antfu/design/components/Display/DisplayKeyValue.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackTip from '@antfu/design/components/Feedback/FeedbackTip.vue'
import { computed } from 'vue'
import { ALL_STATUSES, KIND_ICON, KIND_LABEL, SOURCE_META, sourceOf, STATUS_HEX, STATUS_STYLE } from '../kind.ts'
import PierreDiff from './PierreDiff.vue'
import PierreFile from './PierreFile.vue'

// `dark` defaults true. Vue casts an absent *boolean* prop to `false` (not
// `undefined`), so a plain `props.dark ?? true` fallback silently never
// triggers — the default has to be declared here instead.
const props = withDefaults(defineProps<{ datum: TreeDatum | null, isDiff: boolean, dark?: boolean }>(), { dark: true })
const emit = defineEmits<{ close: [] }>()

const member = computed(() => (props.datum?.type === 'member' ? props.datum.member ?? null : null))

interface SurfaceView {
  surface: 'dts' | 'runtime'
  label: string
  changed: boolean
  before: string
  after: string
}

// Both a changed surface (PierreDiff) and an unchanged/single-state one
// (PierreFile) render through @pierre/diffs' client components, so their
// styling (theme, font, chrome) is identical. Purely derived from props —
// each child component owns its own async mount/render lifecycle.
const surfaces = computed<SurfaceView[]>(() => {
  const m = member.value
  if (!m)
    return []

  const result: SurfaceView[] = []
  for (const [surface, label] of [['dts', 'Type (.d.ts)'], ['runtime', 'Runtime (.js)']] as const) {
    const before = (m.base?.[surface] ?? '').trim()
    const after = (m.current?.[surface] ?? '').trim()
    if (!before && !after)
      continue
    const changed = props.isDiff && !!before && !!after && before !== after
    result.push({ surface, label, changed, before, after })
  }
  return result
})

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

    <!-- member body: @pierre/diffs-rendered signatures / diff (consistent styling for both) -->
    <div v-if="member" class="p-3 flex-1 overflow-auto space-y-4">
      <section v-for="s in surfaces" :key="s.surface">
        <div class="text-micro tracking-wide color-faint mb-1 uppercase">
          {{ s.label }}
        </div>
        <PierreDiff v-if="s.changed" :before="s.before" :after="s.after" :dark="dark" />
        <PierreFile v-else :code="s.after || s.before" :dark="dark" />
      </section>
      <FeedbackEmptyState v-if="!surfaces.length" icon="i-ph-code" title="No signature captured" />
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
