<script setup lang="ts">
import type { DiffStatus, MemberNode } from '../types.ts'
import { computed } from 'vue'
import { CHANGED_STATUSES, STATUS_STYLE } from '../kind.ts'
import EntryItem from './EntryItem.vue'

// A list of changed members grouped by change type, in a fixed order:
// removed -> narrowed -> widened -> added ('unchanged' members are dropped).
// Reused by SummaryPanel (per-package sections) and DetailDrawer (an
// entry/group selection's own members).
const props = defineProps<{ members: MemberNode[] }>()
const emit = defineEmits<{ select: [member: MemberNode] }>()

interface StatusGroup { status: DiffStatus, members: MemberNode[] }

const groups = computed<StatusGroup[]>(() => {
  const byStatus = new Map<DiffStatus, MemberNode[]>()
  for (const m of props.members) {
    if (m.status === 'unchanged')
      continue
    const list = byStatus.get(m.status) ?? []
    list.push(m)
    byStatus.set(m.status, list)
  }

  const out: StatusGroup[] = []
  for (const status of CHANGED_STATUSES) {
    const list = byStatus.get(status)
    if (list?.length)
      out.push({ status, members: list })
  }
  return out
})
</script>

<template>
  <div v-for="g in groups" :key="g.status" class="mb-1">
    <div class="text-2.5 px-2 py-0.5 flex gap-1.5 items-center" :class="STATUS_STYLE[g.status].text">
      <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="STATUS_STYLE[g.status].dot" />
      {{ STATUS_STYLE[g.status].label }}
      <span class="op-mute">{{ g.members.length }}</span>
    </div>
    <EntryItem
      v-for="m in g.members" :key="m.name"
      :member="m"
      :show-background="false"
      @select="emit('select', m)"
    />
  </div>
</template>
