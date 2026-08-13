<script setup lang="ts">
import type { RefOption } from './components/RefSelect.vue'
import type { TreeDatum } from './tree.ts'
import type { MemberNode, MetaPayload, RefsPayload, SideMeta, UiExtractOptions, WorkspacePayload } from './types.ts'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import ActionToggle from '@antfu/design/components/Action/ActionToggle.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import FeedbackSpinner from '@antfu/design/components/Feedback/FeedbackSpinner.vue'
import FeedbackTip from '@antfu/design/components/Feedback/FeedbackTip.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import FormNumberInput from '@antfu/design/components/Form/FormNumberInput.vue'
import FormSearchField from '@antfu/design/components/Form/FormSearchField.vue'

import { refDebounced, useDark, useToggle } from '@vueuse/core'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import DetailDrawer from './components/DetailDrawer.vue'
import GraphCanvas from './components/GraphCanvas.vue'
import RefSelect from './components/RefSelect.vue'
import SummaryPanel from './components/SummaryPanel.vue'
import { ALL_STATUSES } from './kind.ts'
import * as rpc from './rpc.ts'
import { buildTree } from './tree.ts'
import { WORKING_TREE } from './types.ts'

const meta = ref<MetaPayload | null>(null)
const refs = ref<RefsPayload | null>(null)
const payload = ref<WorkspacePayload | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const base = ref('HEAD')
const compare = ref(WORKING_TREE)
const allHistory = ref(false)
const options = reactive<UiExtractOptions>({ omitArgumentNames: true, typeWidening: true, referenceTracingDepth: 1 })

const search = ref('')
const searchDebounced = refDebounced(search, 200)
const groupByKind = ref(false)
const showReferenced = ref(false)
const changedOnly = ref(false)
const showOptions = ref(false)

const isDark = useDark({ initialValue: 'dark' })
const toggleDark = useToggle(isDark)

const selected = ref<TreeDatum | null>(null)
const selectedId = ref<string | undefined>()

const isStatic = computed(() => meta.value?.isStatic ?? false)
const git = computed(() => payload.value?.git ?? false)
const showPickers = computed(() => git.value && !isStatic.value)

/** Effective timestamp for a side: "now" for the working tree, else its resolved ref date. */
function sideTimestamp(side: SideMeta): number | undefined {
  if (side.kind === 'working')
    return Date.now()
  return side.resolved?.date ? new Date(side.resolved.date).getTime() : undefined
}

/** True when Base is newer than Compare, i.e. the diff direction looks backwards. */
const reversedRefs = computed(() => {
  if (!payload.value?.isDiff)
    return false
  const b = sideTimestamp(payload.value.base)
  const c = sideTimestamp(payload.value.compare)
  return b !== undefined && c !== undefined && b > c
})

function swapRefs() {
  const b = base.value
  base.value = compare.value
  compare.value = b
}

/** Flat option list for the Base / Compare selects, with disabled group headers. */
const refOptions = computed<RefOption[]>(() => {
  const r = refs.value
  const opts: RefOption[] = [{ value: WORKING_TREE, label: 'Working tree', type: 'working' }]
  if (r?.head)
    opts.push({ value: 'HEAD', label: 'HEAD', type: 'head', subject: r.head.subject, date: r.head.date })
  if (r?.branches.length) {
    opts.push({ value: '__h_branches', label: 'Branches', type: 'header', disabled: true })
    for (const b of r.branches)
      opts.push({ value: b.name, label: b.name, type: 'branch', date: b.date })
  }
  if (r?.tags.length) {
    opts.push({ value: '__h_tags', label: 'Tags', type: 'header', disabled: true })
    for (const t of r.tags)
      opts.push({ value: t.name, label: t.name, type: 'tag', date: t.date })
  }
  if (r?.commits.length) {
    opts.push({ value: '__h_commits', label: allHistory.value ? 'Commits' : 'Commits touching snapshots', type: 'header', disabled: true })
    for (const c of r.commits)
      opts.push({ value: c.sha, label: c.shortSha, type: 'commit', subject: c.subject, date: c.date })
  }
  return opts
})

const tree = computed<TreeDatum | null>(() => {
  if (!payload.value)
    return null
  const active = new Set(ALL_STATUSES)
  if (changedOnly.value)
    active.delete('unchanged')
  return buildTree(payload.value, {
    search: searchDebounced.value,
    statuses: active,
    groupByKind: groupByKind.value,
    showReferenced: showReferenced.value,
  })
})

async function loadPayload() {
  loading.value = true
  error.value = null
  try {
    payload.value = await rpc.getPayload({ base: base.value, compare: compare.value, options: { ...options } })
  }
  catch (e: any) {
    error.value = e?.message ?? String(e)
  }
  finally {
    loading.value = false
  }
}

async function loadRefs() {
  try {
    refs.value = await rpc.getRefs(allHistory.value)
  }
  catch {}
}

function selectNode(datum: TreeDatum) {
  if (datum.type === 'root')
    return
  selected.value = datum
  selectedId.value = datum.id
}

function findByMember(node: TreeDatum, m: MemberNode): TreeDatum | undefined {
  if (node.member === m)
    return node
  for (const child of node.children ?? []) {
    const hit = findByMember(child, m)
    if (hit)
      return hit
  }
  return undefined
}

/** Select a member picked from the summary list, highlighting its graph node when visible. */
function selectMember(m: MemberNode) {
  const hit = tree.value ? findByMember(tree.value, m) : undefined
  if (hit) {
    selectNode(hit)
  }
  else {
    // Filtered out of the current tree; still show its detail.
    selected.value = { id: `member::${m.name}`, type: 'member', label: m.display, kind: m.kind, status: m.status, member: m }
    selectedId.value = undefined
  }
}

function closeDrawer() {
  selected.value = null
  selectedId.value = undefined
}

onMounted(async () => {
  try {
    meta.value = await rpc.getMeta()
    base.value = meta.value.defaultBase
    compare.value = meta.value.defaultCompare
    Object.assign(options, meta.value.options)
  }
  catch (e: any) {
    error.value = `Failed to connect: ${e?.message ?? e}`
  }
  await Promise.all([loadRefs(), loadPayload()])
})

// Refetch when sides or extraction options change (skip in static mode).
watch(
  () => [base.value, compare.value, JSON.stringify(options)],
  () => {
    if (!isStatic.value)
      loadPayload()
  },
)
watch(allHistory, () => {
  if (!isStatic.value)
    loadRefs()
})
</script>

<template>
  <div class="h-full flex flex-col bg-base color-base">
    <!-- top bar -->
    <header class="flex flex-wrap gap-2 px-3 py-2 border-b border-base items-center z-nav">
      <div class="flex gap-1.5 font-semibold mr-2 items-center">
        <span class="i-ph-graph-duotone color-active text-lg" /> tsnapi
        <span class="op-fade font-normal text-sm">Inspector</span>
      </div>

      <template v-if="showPickers">
        <RefSelect v-model="base" :options="refOptions" placeholder="Base" />
        <span class="i-ph-arrow-right op-fade" />
        <RefSelect v-model="compare" :options="refOptions" placeholder="Compare" />
        <ActionToggle v-model="allHistory" icon="i-ph-clock-counter-clockwise" label="All history" />
      </template>
      <div v-else-if="payload" class="text-sm op-fade flex gap-1.5 items-center">
        <span class="i-ph-eye" />
        <span v-if="payload.isDiff">{{ payload.base.label }} → {{ payload.compare.label }}</span>
        <span v-else>{{ payload.compare.label }}</span>
        <span v-if="isStatic" class="badge-muted">static</span>
      </div>

      <div class="flex-1" />

      <FormSearchField v-model="search" placeholder="Search members" size="sm" class="w-52" />

      <ActionButton v-if="!isStatic" size="sm" icon="i-ph-arrows-clockwise" :loading="loading" @click="loadPayload">
        Re-extract
      </ActionButton>
      <ActionIconButton v-if="!isStatic" icon="i-ph-sliders" tooltip="Extraction options" :active="showOptions" @click="showOptions = !showOptions" />
      <ActionIconButton
        :icon="isDark ? 'i-ph-moon-stars' : 'i-ph-sun'"
        :tooltip="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleDark()"
      />
    </header>

    <!-- reversed base/compare banner -->
    <div v-if="reversedRefs" class="text-sm px-3 py-2 border-b border-base bg-amber-500/10 flex gap-2 items-center">
      <span class="i-ph-warning-circle text-amber-500 shrink-0" />
      <span class="flex-1">
        Base (<strong>{{ payload!.base.label }}</strong>) looks newer than Compare (<strong>{{ payload!.compare.label }}</strong>). The direction might be reversed.
      </span>
      <ActionButton v-if="!isStatic" size="sm" icon="i-ph-arrows-left-right" @click="swapRefs">
        Swap
      </ActionButton>
    </div>

    <!-- options panel -->
    <div v-if="showOptions" class="flex flex-wrap gap-4 px-4 py-2 border-b border-base bg-active/40 items-center">
      <FormCheckbox v-model="options.omitArgumentNames" label="Omit argument names" />
      <FormCheckbox v-model="options.typeWidening" label="Type widening" />
      <label class="text-sm flex gap-2 items-center">
        <span class="op-fade">Reference tracing depth</span>
        <FormNumberInput v-model="options.referenceTracingDepth" :min="0" :max="5" class="w-28" />
      </label>
    </div>

    <!-- filter bar: view options, checkbox toggles -->
    <div v-if="payload" class="flex flex-wrap gap-3 px-3 py-1.5 border-b border-base items-center">
      <FormCheckbox v-model="groupByKind">
        <span class="flex gap-1.5 items-center"><span class="i-ph-tree-structure op-fade" /> Group</span>
      </FormCheckbox>
      <FormCheckbox v-model="showReferenced">
        <span class="flex gap-1.5 items-center"><span class="i-ph-link op-fade" /> Internal</span>
      </FormCheckbox>
      <FormCheckbox v-if="payload?.isDiff" v-model="changedOnly">
        <span class="flex gap-1.5 items-center"><span class="i-ph-funnel op-fade" /> Changed only</span>
      </FormCheckbox>
    </div>

    <!-- body -->
    <main class="min-h-0 flex-1 relative">
      <div v-if="error" class="p-6 inset-0 absolute flex items-center justify-center">
        <FeedbackTip type="error" icon="i-ph-warning-circle" class="max-w-lg">
          <div class="font-medium mb-1">
            Something went wrong
          </div>
          <p class="whitespace-pre-wrap op-fade">
            {{ error }}
          </p>
        </FeedbackTip>
      </div>

      <div v-else-if="loading && !payload" class="text-2xl op-fade inset-0 absolute flex items-center justify-center">
        <FeedbackSpinner size="1.5em" />
      </div>

      <div v-else-if="tree && tree.children && tree.children.length" class="h-full">
        <GraphCanvas :root="tree" :selected-id="selectedId" @select="selectNode" />
      </div>

      <FeedbackEmptyState
        v-else
        class="inset-0 absolute"
        icon="i-ph-magnifying-glass"
        title="No members match the current filters"
      />

      <DetailDrawer
        v-if="selected"
        :datum="selected"
        :is-diff="payload?.isDiff ?? false"
        :dark="isDark"
        @close="closeDrawer"
        @select-member="selectMember"
      />
      <SummaryPanel
        v-else-if="payload && payload.isDiff"
        :payload="payload"
        @select-member="selectMember"
      />
    </main>
  </div>
</template>
