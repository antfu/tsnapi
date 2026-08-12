<script setup lang="ts">
import type { TreeDatum } from './tree.ts'
import type { DiffStatus, MetaPayload, RefsPayload, UiExtractOptions, WorkspacePayload } from './types.ts'
import { refDebounced, useDark, useToggle } from '@vueuse/core'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import DetailDrawer from './components/DetailDrawer.vue'
import GraphCanvas from './components/GraphCanvas.vue'
import RefPicker from './components/RefPicker.vue'
import { ALL_STATUSES, STATUS_STYLE } from './kind.ts'
import * as rpc from './rpc.ts'
import { buildTree, totalCounts } from './tree.ts'
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
const showReferenced = ref(true)
const changedOnly = ref(false)
const statuses = ref<Set<DiffStatus>>(new Set(ALL_STATUSES))
const showOptions = ref(false)

const isDark = useDark({ initialValue: 'dark' })
const toggleDark = useToggle(isDark)

const selected = ref<TreeDatum | null>(null)
const selectedId = ref<string | undefined>()

// Track whether the user has manually toggled "changed only" so an incoming
// diff doesn't override their choice.
let userTouchedChanged = false

const isStatic = computed(() => meta.value?.isStatic ?? false)
const git = computed(() => payload.value?.git ?? false)

const counts = computed(() => (payload.value ? totalCounts(payload.value) : null))

const tree = computed<TreeDatum | null>(() => {
  if (!payload.value)
    return null
  const active = new Set(statuses.value)
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
    // Default to changed-only when a diff is active.
    if (payload.value.isDiff && !userTouchedChanged)
      changedOnly.value = true
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

function toggleChanged() {
  userTouchedChanged = true
  changedOnly.value = !changedOnly.value
}

function toggleStatus(s: DiffStatus) {
  const next = new Set(statuses.value)
  if (next.has(s))
    next.delete(s)
  else next.add(s)
  statuses.value = next
}

function selectNode(datum: TreeDatum) {
  if (datum.type === 'root')
    return
  selected.value = datum
  selectedId.value = datum.id
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
  <div class="h-full flex flex-col bg-base text-base">
    <!-- top bar -->
    <header class="flex items-center gap-2 px-3 py-2 border-b border-base flex-wrap">
      <div class="flex items-center gap-1.5 font-semibold mr-2">
        <span class="i-ph-graph-duotone text-primary text-lg" /> tsnapi
        <span class="op-50 font-normal text-sm">Inspector</span>
      </div>

      <template v-if="git && !isStatic">
        <RefPicker
          v-model="base" label="Base" :refs="refs" :all-history="allHistory"
          allow-working @update:all-history="allHistory = $event"
        />
        <span class="i-ph-arrow-right op-50" />
        <RefPicker
          v-model="compare" label="Compare" :refs="refs" :all-history="allHistory"
          allow-working @update:all-history="allHistory = $event"
        />
      </template>
      <div v-else-if="payload" class="text-sm op-70 flex items-center gap-1.5">
        <span class="i-ph-eye" />
        <span v-if="payload.isDiff">{{ payload.base.label }} → {{ payload.compare.label }}</span>
        <span v-else>{{ payload.compare.label }}</span>
        <span v-if="isStatic" class="text-2.5 px-1 rounded bg-active op-70">static</span>
      </div>

      <div class="flex-1" />

      <div class="relative flex items-center gap-1.5 px-2 rounded border border-base bg-base">
        <span class="i-ph-magnifying-glass op-50 text-2.5" />
        <input v-model="search" placeholder="Search members…" class="bg-transparent outline-none py-1 text-sm w-40">
      </div>

      <button class="btn" :class="{ 'btn-active': groupByKind }" title="Group members by kind" @click="groupByKind = !groupByKind">
        <span class="i-ph-tree-structure" /> Group
      </button>
      <button class="btn" :class="{ 'btn-active': showReferenced }" title="Show internal referenced types" @click="showReferenced = !showReferenced">
        <span class="i-ph-link" /> Internal
      </button>
      <button v-if="payload?.isDiff" class="btn" :class="{ 'btn-active': changedOnly }" @click="toggleChanged">
        <span class="i-ph-funnel" /> Changed only
      </button>
      <button v-if="!isStatic" class="btn" title="Re-extract (re-read dist)" @click="loadPayload">
        <span class="i-ph-arrows-clockwise" :class="{ 'animate-spin': loading }" /> Re-extract
      </button>
      <button v-if="!isStatic" class="btn" :class="{ 'btn-active': showOptions }" title="Extraction options" @click="showOptions = !showOptions">
        <span class="i-ph-sliders" />
      </button>
      <button class="btn" :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'" @click="toggleDark()">
        <span :class="isDark ? 'i-ph-moon-stars' : 'i-ph-sun'" />
      </button>
    </header>

    <!-- options panel -->
    <div v-if="showOptions" class="flex items-center gap-4 px-4 py-2 border-b border-base text-sm bg-active/30">
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input v-model="options.omitArgumentNames" type="checkbox"> omit argument names
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input v-model="options.typeWidening" type="checkbox"> type widening
      </label>
      <label class="flex items-center gap-1.5">
        reference tracing depth
        <input v-model.number="options.referenceTracingDepth" type="number" min="0" max="5" class="w-14 px-1 rounded border border-base bg-base">
      </label>
    </div>

    <!-- legend -->
    <div v-if="counts" class="flex items-center gap-3 px-4 py-1.5 border-b border-base text-2.5">
      <button
        v-for="s in ALL_STATUSES" :key="s"
        class="flex items-center gap-1 rounded px-1.5 py-0.5 transition"
        :class="statuses.has(s) ? '' : 'op-40 line-through'"
        @click="toggleStatus(s)"
      >
        <span class="w-2 h-2 rounded-full" :class="STATUS_STYLE[s].dot" />
        {{ STATUS_STYLE[s].label }}
        <span class="op-60">{{ counts[s] }}</span>
      </button>
    </div>

    <!-- body -->
    <main class="relative flex-1 min-h-0">
      <div v-if="error" class="absolute inset-0 flex items-center justify-center">
        <div class="panel p-4 max-w-md text-sm">
          <div class="flex items-center gap-2 text-red-500 font-medium mb-1">
            <span class="i-ph-warning-circle" /> Error
          </div>
          <p class="op-80 whitespace-pre-wrap">
            {{ error }}
          </p>
        </div>
      </div>

      <div v-else-if="loading && !payload" class="absolute inset-0 flex items-center justify-center op-60">
        <span class="i-ph-circle-notch animate-spin text-2xl" />
      </div>

      <div v-else-if="tree && tree.children && tree.children.length" class="h-full">
        <GraphCanvas :root="tree" :selected-id="selectedId" @select="selectNode" />
      </div>

      <div v-else class="absolute inset-0 flex items-center justify-center op-60 text-sm">
        No members match the current filters.
      </div>

      <DetailDrawer :datum="selected" :is-diff="payload?.isDiff ?? false" @close="closeDrawer" />
    </main>
  </div>
</template>
