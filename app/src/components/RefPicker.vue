<script setup lang="ts">
import type { GitRef, RefsPayload } from '../types.ts'
import { onClickOutside } from '@vueuse/core'
import { computed, ref } from 'vue'
import { WORKING_TREE } from '../types.ts'

const props = defineProps<{
  label: string
  modelValue: string
  refs: RefsPayload | null
  allowWorking?: boolean
  allHistory: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:allHistory': [value: boolean]
}>()

const open = ref(false)
const root = ref<HTMLElement>()
const custom = ref('')
onClickOutside(root, () => (open.value = false))

const currentLabel = computed(() => {
  if (props.modelValue === WORKING_TREE)
    return 'Working tree'
  const all = [...(props.refs?.branches ?? []), ...(props.refs?.tags ?? []), ...(props.refs?.commits ?? [])]
  const hit = all.find(r => r.name === props.modelValue || r.sha === props.modelValue || r.shortSha === props.modelValue)
  return hit ? (hit.name || hit.shortSha) : props.modelValue
})

function pick(value: string) {
  emit('update:modelValue', value)
  open.value = false
}
function pickRef(r: GitRef) {
  pick(r.name || r.sha)
}
function submitCustom() {
  if (custom.value.trim())
    pick(custom.value.trim())
}
</script>

<template>
  <div ref="root" class="relative">
    <button class="btn min-w-40 justify-between" @click="open = !open">
      <span class="flex items-center gap-1.5 min-w-0">
        <span class="text-2.5 op-50 shrink-0">{{ label }}</span>
        <span class="truncate">{{ currentLabel }}</span>
      </span>
      <span class="i-ph-caret-down text-2.5 shrink-0" />
    </button>

    <div v-if="open" class="panel absolute left-0 top-full mt-1 w-72 max-h-[70vh] overflow-auto z-50 p-1 text-sm">
      <div class="flex items-center justify-between px-2 py-1">
        <span class="text-2.5 uppercase op-50">Refs</span>
        <label class="flex items-center gap-1 text-2.5 op-70 cursor-pointer">
          <input type="checkbox" :checked="allHistory" @change="emit('update:allHistory', ($event.target as HTMLInputElement).checked)">
          all history
        </label>
      </div>

      <button v-if="allowWorking" class="menu-item" :class="{ 'btn-active': modelValue === WORKING_TREE }" @click="pick(WORKING_TREE)">
        <span class="i-ph-pencil-simple" /> Working tree
      </button>

      <template v-if="refs?.head">
        <div class="menu-head">
          HEAD
        </div>
        <button class="menu-item" :class="{ 'btn-active': modelValue === 'HEAD' }" @click="pick('HEAD')">
          <span class="i-ph-git-commit" /> HEAD
          <span class="op-50 text-2.5 truncate">{{ refs.head.subject }}</span>
        </button>
      </template>

      <template v-if="refs?.branches.length">
        <div class="menu-head">
          Branches
        </div>
        <button v-for="r in refs.branches" :key="r.name" class="menu-item" :class="{ 'btn-active': modelValue === r.name }" @click="pickRef(r)">
          <span class="i-ph-git-branch" /> {{ r.name }}
        </button>
      </template>

      <template v-if="refs?.tags.length">
        <div class="menu-head">
          Tags
        </div>
        <button v-for="r in refs.tags" :key="r.name" class="menu-item" :class="{ 'btn-active': modelValue === r.name }" @click="pickRef(r)">
          <span class="i-ph-tag" /> {{ r.name }}
        </button>
      </template>

      <template v-if="refs?.commits.length">
        <div class="menu-head">
          Commits{{ allHistory ? '' : ' (touching snapshots)' }}
        </div>
        <button v-for="r in refs.commits" :key="r.sha" class="menu-item" :class="{ 'btn-active': modelValue === r.sha }" @click="pickRef(r)">
          <span class="i-ph-git-commit op-60" />
          <span class="font-mono text-2.5">{{ r.shortSha }}</span>
          <span class="op-60 truncate">{{ r.subject }}</span>
        </button>
      </template>

      <div class="menu-head">
        Custom ref / sha
      </div>
      <form class="flex gap-1 px-1 pb-1" @submit.prevent="submitCustom">
        <input v-model="custom" placeholder="sha, tag, branch…" class="flex-1 px-2 py-1 rounded border border-base bg-base text-xs">
        <button class="btn !px-2" type="submit">
          <span class="i-ph-arrow-right" />
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.menu-item {
  @apply w-full flex items-center gap-1.5 px-2 py-1 rounded text-left hover:bg-active transition text-xs;
}
.menu-head {
  @apply px-2 pt-2 pb-0.5 text-2.5 uppercase tracking-wide op-40;
}
</style>
