<script setup lang="ts">
import type { MemberNode, SideMeta, WorkspacePayload } from '../types.ts'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import { formatTimeAgo } from '@vueuse/core'
import { computed } from 'vue'
import EntryItem from './EntryItem.vue'

const props = defineProps<{ payload: WorkspacePayload }>()
const emit = defineEmits<{ selectMember: [member: MemberNode] }>()

function sideAgo(side: SideMeta): string {
  if (side.kind === 'working')
    return 'working tree'
  if (side.resolved?.date)
    return formatTimeAgo(new Date(side.resolved.date))
  return 'unknown'
}

interface Group { name: string, dir: string, members: MemberNode[] }

const groups = computed<Group[]>(() => {
  const out: Group[] = []
  for (const pkg of props.payload.packages) {
    const members: MemberNode[] = []
    for (const entry of pkg.entries) {
      for (const m of entry.members) {
        if (m.status !== 'unchanged')
          members.push(m)
      }
    }
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

    <!-- TODO: group by change type: Remove -> Narrowed -> Widened -> Added -->
    <div class="p-2 flex-1 overflow-auto">
      <template v-if="total">
        <section v-for="g in groups" :key="g.name" class="mb-3">
          <div class="text-micro tracking-wide color-faint px-2 py-1 flex gap-1.5 items-center uppercase">
            <span class="i-ph-package" />
            <span class="truncate">{{ g.name }}</span>
            <span class="op-mute">{{ g.members.length }}</span>
          </div>
          <EntryItem
            v-for="m in g.members" :key="`${g.name}:${m.name}`"
            :member="m"
            :show-background="false"
            @select="emit('selectMember', $event)"
          />
        </section>
      </template>
      <FeedbackEmptyState v-else icon="i-ph-check-circle" title="No API changes between these refs" />
    </div>
  </div>
</template>
