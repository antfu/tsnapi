<script setup lang="ts">
import type { MemberNode, SideMeta, WorkspacePayload } from '../types.ts'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import { formatTimeAgo } from '@vueuse/core'
import { computed } from 'vue'
import ChangeGroupList from './ChangeGroupList.vue'

const props = defineProps<{ payload: WorkspacePayload, hiddenPackages?: Set<string> }>()
const emit = defineEmits<{ selectMember: [member: MemberNode] }>()

function sideAgo(side: SideMeta): string {
  if (side.kind === 'working')
    return 'working tree'
  if (side.resolved?.date)
    return formatTimeAgo(new Date(side.resolved.date))
  return 'unknown'
}

interface PackageGroup { name: string, dir: string, members: MemberNode[] }

// Group changes by package; change-type grouping within each package is
// delegated to ChangeGroupList (shared with DetailDrawer's entry/group view).
const groups = computed<PackageGroup[]>(() => {
  const out: PackageGroup[] = []
  for (const pkg of props.payload.packages) {
    if (props.hiddenPackages?.has(pkg.name))
      continue
    const members = pkg.entries.flatMap(entry => entry.members.filter(m => m.status !== 'unchanged'))
    if (members.length)
      out.push({ name: pkg.name, dir: pkg.dir, members })
  }
  return out
})

const total = computed(() => groups.value.reduce((n, g) => n + g.members.length, 0))
</script>

<template>
  <div class="panel bottom-3 right-3 top-3 absolute flex flex-col w-[440px] max-w-[85vw] z-panel-content">
    <header class="px-3 py-2 border-b border-base flex gap-2 items-center">
      <span class="i-ph-git-diff color-active text-lg" />
      <div class="font-medium">
        API changes
      </div>
      <span v-if="total" class="badge-muted font-mono tabular-nums">{{ total }}</span>
    </header>

    <div class="px-3 py-2 border-b border-base text-xs op-fade leading-relaxed">
      From <span class="color-base font-bold">{{ payload.base.label }}</span>
      <span class="op-fade">({{ sideAgo(payload.base) }})</span>
      to <span class="color-base font-bold">{{ payload.compare.label }}</span>
      <span class="op-fade">({{ sideAgo(payload.compare) }})</span>,<br>
      the following API changed:
    </div>

    <div class="p-2 flex-1 overflow-auto">
      <template v-if="total">
        <section v-for="g in groups" :key="g.name" class="mb-3">
          <div class="text-micro tracking-wide color-faint px-2 py-1 flex gap-1.5 items-center uppercase">
            <span class="i-ph-package" />
            <span class="truncate">{{ g.name }}</span>
            <span class="op-mute">{{ g.members.length }}</span>
          </div>
          <ChangeGroupList :members="g.members" @select="emit('selectMember', $event)" />
        </section>
      </template>
      <FeedbackEmptyState v-else icon="i-ph-check-circle" title="No API changes between these refs" />
    </div>
  </div>
</template>
