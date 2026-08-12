<script setup lang="ts">
import type { HierarchyPointNode } from 'd3-hierarchy'
import type { TreeDatum } from '../tree.ts'
import { hierarchy, tree } from 'd3-hierarchy'
import { linkHorizontal } from 'd3-shape'
import { computed, ref, watch } from 'vue'
import { KIND_ICON, SOURCE_META, sourceOf, STATUS_STYLE } from '../kind.ts'

const props = defineProps<{ root: TreeDatum, selectedId?: string }>()
const emit = defineEmits<{ select: [datum: TreeDatum] }>()

const COL_WIDTH = 280
const ROW_GAP = 30
const NODE_W = 240
const NODE_H = 24

const layout = computed(() => {
  const h = hierarchy<TreeDatum>(props.root, d => d.children)
  const treeLayout = tree<TreeDatum>().nodeSize([ROW_GAP, COL_WIDTH])
  treeLayout(h)
  const nodes = h.descendants() as HierarchyPointNode<TreeDatum>[]
  const links = h.links()

  let minX = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    maxX = Math.max(maxX, n.x)
    maxY = Math.max(maxY, n.y)
  }
  const offsetX = -minX + ROW_GAP
  return {
    nodes: nodes.map(n => ({ node: n, x: n.y, y: n.x + offsetX })),
    links,
    offsetX,
    width: maxY + COL_WIDTH,
    height: (maxX - minX) + ROW_GAP * 2,
  }
})

const linkPath = linkHorizontal<any, HierarchyPointNode<TreeDatum>>()
  .x(d => d.y)
  .y(d => d.x)

const paths = computed(() => {
  const off = layout.value.offsetX
  return layout.value.links.map((l) => {
    const source = { x: (l.source as any).x + off, y: (l.source as any).y }
    const target = { x: (l.target as any).x + off, y: (l.target as any).y }
    return linkPath({ source, target } as any) ?? ''
  })
})

// pan / zoom
const tx = ref(20)
const ty = ref(20)
const scale = ref(1)
const dragging = ref(false)
let startX = 0
let startY = 0

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = -e.deltaY * 0.0015
  const next = Math.min(2.5, Math.max(0.2, scale.value * (1 + delta)))
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  // zoom around cursor
  tx.value = mx - (mx - tx.value) * (next / scale.value)
  ty.value = my - (my - ty.value) * (next / scale.value)
  scale.value = next
}

function onDown(e: PointerEvent) {
  dragging.value = true
  startX = e.clientX - tx.value
  startY = e.clientY - ty.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragging.value)
    return
  tx.value = e.clientX - startX
  ty.value = e.clientY - startY
}
function onUp() {
  dragging.value = false
}

function reset() {
  tx.value = 20
  ty.value = 20
  scale.value = 1
}

watch(() => props.root, reset)

defineExpose({ reset })
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden bg-dot cursor-grab active:cursor-grabbing"
    @wheel="onWheel"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointerleave="onUp"
  >
    <div
      class="absolute left-0 top-0 origin-top-left"
      :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
    >
      <svg
        class="absolute left-0 top-0 pointer-events-none overflow-visible"
        :width="layout.width" :height="layout.height"
      >
        <path
          v-for="(d, i) in paths" :key="i" :d="d"
          fill="none" class="stroke-gray-400/30" stroke-width="1.5"
        />
      </svg>

      <div
        v-for="item in layout.nodes" :key="item.node.data.id"
        class="absolute flex items-center bg-base rounded"
        :style="{ transform: `translate(${item.x}px, ${item.y - NODE_H / 2}px)`, height: `${NODE_H}px` }"
      >
        <!-- member -->
        <button
          v-if="item.node.data.type === 'member'"
          class="flex items-center gap-1.5 px-2 h-full rounded border bg-base text-xs whitespace-nowrap hover:bg-active transition cursor-pointer"
          :class="[
            STATUS_STYLE[item.node.data.status!].border,
            item.node.data.status === 'unchanged' ? 'op-55 hover:op-100' : '',
            props.selectedId === item.node.data.id ? 'ring-2 ring-primary' : '',
          ]"
          :style="{ maxWidth: `${NODE_W}px` }"
          :title="`${item.node.data.label} — ${SOURCE_META[sourceOf(item.node.data.member!)].label}`"
          @click.stop="emit('select', item.node.data)"
        >
          <span class="shrink-0" :class="[KIND_ICON[item.node.data.kind!], STATUS_STYLE[item.node.data.status!].text]" />
          <span class="truncate">{{ item.node.data.label }}</span>
          <span
            class="shrink-0 text-2.5 op-55"
            :class="SOURCE_META[sourceOf(item.node.data.member!)].icon"
          />
          <span v-if="item.node.data.status !== 'unchanged'" class="shrink-0 text-2.5" :class="[STATUS_STYLE[item.node.data.status!].icon, STATUS_STYLE[item.node.data.status!].text]" />
        </button>

        <!-- package -->
        <button
          v-else-if="item.node.data.type === 'package'"
          class="flex items-center gap-1.5 px-2.5 h-full rounded-md border bg-primary/10 text-sm font-medium whitespace-nowrap hover:bg-primary/20 transition cursor-pointer"
          :class="props.selectedId === item.node.data.id ? 'border-primary ring-2 ring-primary' : 'border-primary/40'"
          @click.stop="emit('select', item.node.data)"
        >
          <span class="i-ph-package text-primary" />
          <span>{{ item.node.data.label }}</span>
          <span
            v-if="item.node.data.pkg && item.node.data.pkg.status !== 'ok'"
            class="text-2.5 px-1 rounded bg-amber-500/20 text-amber-500"
          >{{ item.node.data.pkg.status }}</span>
        </button>

        <!-- entry / group / root -->
        <button
          v-else
          class="flex items-center gap-1.5 px-2 h-full rounded border border-base bg-base text-xs whitespace-nowrap transition"
          :class="[
            item.node.data.type === 'root' ? 'font-semibold cursor-default' : 'op-80 hover:bg-active hover:op-100 cursor-pointer',
            props.selectedId === item.node.data.id ? 'ring-2 ring-primary op-100' : '',
          ]"
          @click.stop="emit('select', item.node.data)"
        >
          <span :class="item.node.data.type === 'root' ? 'i-ph-stack' : item.node.data.type === 'group' ? (KIND_ICON[item.node.data.kind!]) : 'i-ph-arrow-square-right'" />
          <span>{{ item.node.data.label }}</span>
          <span v-if="item.node.data.sub" class="text-2.5 op-60">{{ item.node.data.sub }}</span>
        </button>
      </div>
    </div>

    <button class="absolute bottom-3 right-3 btn z-10" title="Reset view" @click="reset">
      <span class="i-ph-crosshair" /> Reset
    </button>
  </div>
</template>

<style scoped>
.bg-dot {
  background-image: radial-gradient(circle, rgba(128, 128, 128, 0.18) 1px, transparent 1px);
  background-size: 22px 22px;
}
</style>
