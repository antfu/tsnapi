<script setup lang="ts">
import type { MemberNode } from '../types.ts'
import { KIND_ICON, KIND_LABEL, SOURCE_META, sourceOf, STATUS_STYLE } from '../kind.ts'

// Reusable, presentational row for a single API entry (member). Pure: renders
// from `member`, emits `select` on click. Used in the summary list, the graph
// canvas (as a compact bordered node), and anywhere a compact entry needs to
// render.
const props = withDefaults(defineProps<{
  member: MemberNode
  selected?: boolean
  /** Show the status icon on the right (defaults to true). */
  showStatus?: boolean
  /** Show the status colour background tint (defaults to true). */
  showBackground?: boolean
  /** Render as a compact bordered node (graph canvas) instead of a full-width list row. */
  bordered?: boolean
  /** Max width in px; only applied when `bordered`. */
  maxWidth?: number
}>(), {
  showStatus: true,
  showBackground: true,
})
const emit = defineEmits<{ select: [member: MemberNode] }>()

const status = () => STATUS_STYLE[props.member.status]
</script>

<template>
  <button
    class="text-xs px-2 rounded flex gap-1.5 transition cursor-pointer items-center whitespace-nowrap hover:bg-active"
    :class="[
      bordered ? 'border h-full' : 'py-1 w-full text-left',
      bordered ? status().border : '',
      showBackground !== false ? status().bg : '',
      member.status === 'unchanged' ? 'op-55 hover:op-100' : '',
      selected ? (bordered ? 'ring-2 ring-primary' : 'ring-1 ring-primary') : '',
    ]"
    :style="bordered && maxWidth ? { maxWidth: `${maxWidth}px` } : undefined"
    :title="`${member.display} · ${KIND_LABEL[member.kind]} · ${SOURCE_META[sourceOf(member)].label}`"
    @click.stop="emit('select', member)"
  >
    <span class="shrink-0" :class="[KIND_ICON[member.kind], status().text]" />
    <span class="truncate" :class="bordered ? '' : 'font-mono'">{{ member.display }}</span>
    <span class="text-2.5 op-55 shrink-0" :class="SOURCE_META[sourceOf(member)].icon" />
    <span v-if="!bordered" class="flex-1" />
    <span
      v-if="showStatus !== false && member.status !== 'unchanged'"
      class="text-2.5 shrink-0"
      :class="[status().icon, status().text]"
      :title="status().label"
    />
  </button>
</template>
