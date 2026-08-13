<script setup lang="ts">
import type { TreeDatum } from '../tree.ts'
import { KIND_ICON } from '../kind.ts'
import EntryItem from './EntryItem.vue'

// Pure, presentational graph node. Renders a single member / package / entry /
// group / root node from its datum and emits `select` on click. No side effects.
// Member nodes delegate to `EntryItem` (bordered variant) so the graph and the
// summary list share one row implementation.
const props = defineProps<{
  datum: TreeDatum
  selected?: boolean
  /** Max width for a member node label, in px. */
  maxWidth?: number
}>()
const emit = defineEmits<{ select: [datum: TreeDatum] }>()

function select() {
  if (props.datum.type !== 'root')
    emit('select', props.datum)
}
</script>

<template>
  <!-- member -->
  <EntryItem
    v-if="datum.type === 'member'"
    :member="datum.member!"
    :selected="selected"
    bordered
    :max-width="maxWidth"
    @select="select"
  />

  <!-- package -->
  <button
    v-else-if="datum.type === 'package'"
    class="text-sm px-2.5 rounded-md border bg-primary/10 font-medium flex gap-1.5 h-full transition cursor-pointer items-center whitespace-nowrap hover:bg-primary/20"
    :class="selected ? 'border-primary ring-2 ring-primary' : 'border-primary/40'"
    @click.stop="select"
  >
    <span class="i-ph-package text-primary" />
    <span>{{ datum.label }}</span>
    <span
      v-if="datum.pkg && datum.pkg.status !== 'ok'"
      class="text-2.5 px-1 rounded bg-amber-500/20 text-amber-500"
    >{{ datum.pkg.status }}</span>
  </button>

  <!-- entry / group / root -->
  <button
    v-else
    class="text-xs px-2 rounded border border-base bg-base flex gap-1.5 h-full transition items-center whitespace-nowrap"
    :class="[
      datum.type === 'root' ? 'font-semibold cursor-default' : 'op-80 cursor-pointer hover:bg-active hover:op-100',
      selected ? 'ring-2 ring-primary op-100' : '',
    ]"
    @click.stop="select"
  >
    <span :class="datum.type === 'root' ? 'i-ph-stack' : datum.type === 'group' ? KIND_ICON[datum.kind!] : 'i-ph-arrow-square-right'" />
    <span>{{ datum.label }}</span>
    <span v-if="datum.sub" class="text-2.5 op-60">{{ datum.sub }}</span>
  </button>
</template>
