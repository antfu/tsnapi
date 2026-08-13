<script setup lang="ts">
import type { MemberNode } from '../types.ts'
import { KIND_ICON, KIND_LABEL, SOURCE_META, sourceOf, STATUS_STYLE } from '../kind.ts'

// Reusable, presentational row for a single API entry (member). Pure: renders
// from `member`, emits `select` on click. Used in the summary list and anywhere
// a compact entry row is needed.
const props = withDefaults(defineProps<{
  member: MemberNode
  selected?: boolean
  /** Show the status icon on the right (defaults to true). */
  showStatus?: boolean
  showBackground?: boolean
}>(), {
  showStatus: true,
  showBackground: true,
})
const emit = defineEmits<{ select: [member: MemberNode] }>()

const status = () => STATUS_STYLE[props.member.status]
</script>

<template>
  <button
    class="text-xs px-2 py-1 rounded flex gap-1.5 w-full transition cursor-pointer items-center text-left hover:bg-active"
    :class="[props.showBackground !== false ? STATUS_STYLE[member.status].bg : '', props.selected ? 'ring-1 ring-primary' : '']"
    :title="`${member.display} · ${KIND_LABEL[member.kind]} · ${SOURCE_META[sourceOf(member)].label}`"
    @click="emit('select', member)"
  >
    <span class="shrink-0" :class="[KIND_ICON[member.kind], status().text]" />
    <span class="font-mono truncate">{{ member.display }}</span>
    <span class="text-2.5 op-55 shrink-0" :class="SOURCE_META[sourceOf(member)].icon" />
    <span class="flex-1" />
    <span
      v-if="showStatus !== false && member.status !== 'unchanged'"
      class="text-2.5 shrink-0"
      :class="[status().icon, status().text]"
      :title="status().label"
    />
  </button>
</template>
