<script setup lang="ts">
import type { TreeDatum } from '../tree.ts'
import { KIND_ICON, SOURCE_META, sourceOf, STATUS_STYLE } from '../kind.ts'

// Pure, presentational graph node. Renders a single member / package / entry /
// group / root node from its datum and emits `select` on click. No side effects.
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
  <button
    v-if="datum.type === 'member'"
    class="text-xs px-2 rounded border flex gap-1.5 h-full transition cursor-pointer items-center whitespace-nowrap hover:bg-active"
    :class="[
      STATUS_STYLE[datum.status!].border,
      STATUS_STYLE[datum.status!].bg,
      datum.status === 'unchanged' ? 'op-55 hover:op-100' : '',
      selected ? 'ring-2 ring-primary' : '',
    ]"
    :style="{ maxWidth: maxWidth ? `${maxWidth}px` : undefined }"
    :title="`${datum.label} · ${SOURCE_META[sourceOf(datum.member!)].label}`"
    @click.stop="select"
  >
    <span class="shrink-0" :class="[KIND_ICON[datum.kind!], STATUS_STYLE[datum.status!].text]" />
    <span class="truncate">{{ datum.label }}</span>
    <span class="text-2.5 op-55 shrink-0" :class="SOURCE_META[sourceOf(datum.member!)].icon" />
    <span
      v-if="datum.status !== 'unchanged'"
      class="text-2.5 shrink-0"
      :class="[STATUS_STYLE[datum.status!].icon, STATUS_STYLE[datum.status!].text]"
    />
  </button>

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
