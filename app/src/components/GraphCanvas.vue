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

// A `re-export` member whose target resolved to a known workspace
// package/entry doesn't get its own graph node — the link line drawn below
// (from its nearest visible ancestor) already conveys "this entry re-exports
// from there", so a dot per re-exported symbol is redundant. Unresolved
// re-exports (external packages, e.g. `export * from 'lodash'`) have nothing
// to link to, so they still render as an ordinary node.
function isHiddenReExportMember(d: TreeDatum): boolean {
  return d.type === 'member' && d.member?.kind === 're-export' && !!d.member.reExportTarget?.packageName
}

// A `re-export` kind-group (only present when "Group by kind" is on) becomes
// pointless once every re-export it would group is itself hidden above —
// nothing would be left to show under it.
function isEmptyReExportGroup(d: TreeDatum): boolean {
  return d.type === 'group' && d.kind === 're-export' && (d.children ?? []).every(isHiddenReExportMember)
}

function isHiddenNode(d: TreeDatum): boolean {
  return isHiddenReExportMember(d) || isEmptyReExportGroup(d)
}

/** The tree.ts id a re-export's resolved target would have, if rendered. */
function reExportTargetId(target: { packageName?: string, entryName?: string }): string | undefined {
  if (!target.packageName)
    return undefined
  return target.entryName ? `${target.packageName}::${target.entryName}` : target.packageName
}

interface ReExportLink { sourceId: string, targetId: string }

/**
 * Walk the (unlaid-out) tree collecting one `{sourceId, targetId}` per
 * resolved re-export, where `sourceId` is the id of the nearest ancestor
 * that will actually be rendered (skipping over the hidden member itself,
 * and any kind-group left empty by hiding it) — computed once here so the
 * layout below never needs to lay out the hidden nodes at all.
 */
function collectReExportLinks(node: TreeDatum, nearestVisibleId: string, out: ReExportLink[]): void {
  for (const child of node.children ?? []) {
    if (isHiddenReExportMember(child)) {
      const targetId = reExportTargetId(child.member?.reExportTarget ?? {})
      if (targetId)
        out.push({ sourceId: nearestVisibleId, targetId })
      continue
    }
    collectReExportLinks(child, isHiddenNode(child) ? nearestVisibleId : child.id, out)
  }
}

const reExportLinks = computed<ReExportLink[]>(() => {
  const out: ReExportLink[] = []
  collectReExportLinks(props.root, props.root.id, out)
  return out
})

// `root` only exists to give d3-hierarchy a single entry point for layout
// (it's a `TreeDatum` wrapping the workspace's packages, not a real graph
// node) — its whole column (one COL_WIDTH, at depth 0) is dropped below so
// packages render as if they were the roots, instead of showing an empty,
// non-interactive root node. Resolved re-exports (and any kind-group left
// empty by hiding them, see above) are excluded the same way, one level
// down, via the `hierarchy()` children accessor — so no row space is
// reserved for a node we're not going to draw.
const layout = computed(() => {
  const h = hierarchy<TreeDatum>(props.root, d => d.children?.filter(c => !isHiddenNode(c)))
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

// Extra, non-hierarchy links: one per resolved re-export whose source
// (nearest visible ancestor) and target (a package or entry node) are both
// currently rendered. Drawn distinctly (dashed, arrowed) from the tree's own
// edges, in place of the hidden re-export member node itself.
const reExportPaths = computed(() => {
  const byId = new Map(layout.value.nodes.map(item => [item.node.data.id, item]))
  const seen = new Set<string>()
  const out: string[] = []
  for (const { sourceId, targetId } of reExportLinks.value) {
    const key = `${sourceId}->${targetId}`
    if (seen.has(key))
      continue
    seen.add(key)
    const sourceItem = byId.get(sourceId)
    const targetItem = byId.get(targetId)
    if (!sourceItem || !targetItem || sourceItem === targetItem)
      continue
    const source = { x: sourceItem.y, y: sourceItem.x }
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
