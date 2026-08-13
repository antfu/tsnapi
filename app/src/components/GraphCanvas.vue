<script setup lang="ts">
import type { HierarchyPointNode } from 'd3-hierarchy'
import type { TreeDatum } from '../tree.ts'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { hierarchy, tree } from 'd3-hierarchy'
import { linkHorizontal } from 'd3-shape'
import { computed, ref, watch } from 'vue'
import GraphNode from './GraphNode.vue'

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
  // Only pan with the primary button, and never when the press starts on an
  // interactive node — otherwise capturing the pointer here swallows the
  // node's `click`, so selection almost never fires.
  if (e.button !== 0 || (e.target as HTMLElement).closest('button'))
    return
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
        class="bg-base rounded absolute flex items-center"
        :style="{ transform: `translate(${item.x}px, ${item.y - NODE_H / 2}px)`, height: `${NODE_H}px` }"
      >
        <GraphNode
          :datum="item.node.data"
          :selected="selectedId === item.node.data.id"
          :max-width="NODE_W"
          @select="emit('select', $event)"
        />
      </div>
    </div>

    <ActionButton class="bottom-3 right-3 absolute z-nav" size="sm" icon="i-ph-crosshair" @click="reset">
      Reset
    </ActionButton>
  </div>
</template>

<style scoped>
.bg-dot {
  background-image: radial-gradient(circle, rgba(128, 128, 128, 0.18) 1px, transparent 1px);
  background-size: 22px 22px;
}
</style>
