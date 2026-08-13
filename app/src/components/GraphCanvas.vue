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

// `root` only exists to give d3-hierarchy a single entry point for layout
// (it's a `TreeDatum` wrapping the workspace's packages, not a real graph
// node) — its whole column (one COL_WIDTH, at depth 0) is dropped below so
// packages render as if they were the roots, instead of showing an empty,
// non-interactive root node.
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
    nodes: nodes
      .filter(n => n.data.type !== 'root')
      .map(n => ({ node: n, x: n.y - COL_WIDTH, y: n.x + offsetX })),
    links: links.filter(l => l.source.data.type !== 'root'),
    offsetX,
    // Removing the root's COL_WIDTH column shifts the rightmost node to
    // `maxY - COL_WIDTH`; adding COL_WIDTH back gives the same right-edge
    // render buffer the un-shifted layout had (nodes are narrower than a
    // column, so the deepest column still needs room to draw).
    width: maxY,
    height: (maxX - minX) + ROW_GAP * 2,
  }
})

const linkPath = linkHorizontal<any, HierarchyPointNode<TreeDatum>>()
  .x(d => d.y)
  .y(d => d.x)

const paths = computed(() => {
  const off = layout.value.offsetX
  return layout.value.links.map((l) => {
    const source = { x: (l.source as any).x + off, y: (l.source as any).y - COL_WIDTH }
    const target = { x: (l.target as any).x + off, y: (l.target as any).y - COL_WIDTH }
    return linkPath({ source, target } as any) ?? ''
  })
})

/** The tree.ts id a re-export's resolved target would have, if rendered. */
function reExportTargetId(target: { packageName?: string, entryName?: string }): string | undefined {
  if (!target.packageName)
    return undefined
  return target.entryName ? `${target.packageName}::${target.entryName}` : target.packageName
}

// Extra, non-hierarchy links: one per currently-rendered `re-export` member
// whose resolved target (a package or entry node) is also currently
// rendered. Drawn distinctly (dashed, arrowed) from the tree's own edges.
const reExportPaths = computed(() => {
  const byId = new Map(layout.value.nodes.map(item => [item.node.data.id, item]))
  const out: string[] = []
  for (const item of layout.value.nodes) {
    const datum = item.node.data
    if (datum.type !== 'member' || datum.member?.kind !== 're-export')
      continue
    const targetId = reExportTargetId(datum.member.reExportTarget ?? {})
    const targetItem = targetId ? byId.get(targetId) : undefined
    if (!targetItem || targetItem === item)
      continue
    const source = { x: item.y, y: item.x }
    const target = { x: targetItem.y, y: targetItem.x }
    const d = linkPath({ source, target } as any)
    if (d)
      out.push(d)
  }
  return out
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
        <defs>
          <marker id="reexport-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" class="fill-cyan-400/70" />
          </marker>
        </defs>
        <path
          v-for="(d, i) in paths" :key="i" :d="d"
          fill="none" class="stroke-gray-400/30" stroke-width="1.5"
        />
        <path
          v-for="(d, i) in reExportPaths" :key="i" :d="d"
          fill="none" class="stroke-cyan-400/60" stroke-width="1.5" stroke-dasharray="4 3"
          marker-end="url(#reexport-arrow)"
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
