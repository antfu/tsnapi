<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { computed } from 'vue'

export interface RefOption {
  value: string
  label: string
  type: 'working' | 'head' | 'branch' | 'tag' | 'commit' | 'header'
  /** ISO date, for the time-ago label. */
  date?: string
  /** Commit subject / secondary text. */
  subject?: string
  disabled?: boolean
}

const props = defineProps<{ options: RefOption[], placeholder?: string }>()
const model = defineModel<string>()

const TYPE_ICON: Record<RefOption['type'], string> = {
  working: 'i-ph-pencil-simple-line',
  head: 'i-ph-bookmark-simple',
  branch: 'i-ph-git-branch',
  tag: 'i-ph-tag',
  commit: 'i-ph-git-commit',
  header: '',
}

const selected = computed(() => props.options.find(o => o.value === model.value))

function ago(opt: RefOption): string {
  return opt.date ? formatTimeAgo(new Date(opt.date)) : ''
}
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger
      class="text-sm px-2.5 outline-none border border-base rounded bg-base inline-flex gap-2 h-9 min-w-36 transition items-center justify-between focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <span class="flex gap-1.5 min-w-0 items-center">
        <span v-if="selected" class="op-fade shrink-0" :class="TYPE_ICON[selected.type]" aria-hidden="true" />
        <SelectValue :placeholder="placeholder ?? 'Select ref'" class="truncate" />
      </span>
      <SelectIcon class="op-fade shrink-0">
        <span class="i-ph-caret-down text-2.5" aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="6"
        class="border border-base rounded-lg bg-base min-w-72 max-w-96 shadow-lg z-dropdown overflow-hidden"
      >
        <SelectViewport class="p-1 max-h-[60vh] overflow-auto">
          <template v-for="opt in options" :key="opt.value">
            <SelectLabel
              v-if="opt.type === 'header'"
              class="text-micro tracking-wide color-faint px-2 pt-2 pb-0.5 uppercase"
            >
              {{ opt.label }}
            </SelectLabel>
            <SelectItem
              v-else
              :value="opt.value"
              :disabled="opt.disabled"
              class="text-sm color-base py-0.5 pl-6 pr-2 outline-none rounded flex gap-1.5 cursor-pointer select-none transition items-center relative data-[highlighted]:bg-hover data-[disabled]:op50"
            >
              <SelectItemIndicator class="color-active inline-flex items-center left-1 absolute">
                <span class="i-ph-check-bold text-2.5" aria-hidden="true" />
              </SelectItemIndicator>
              <span class="op-fade shrink-0" :class="TYPE_ICON[opt.type]" aria-hidden="true" />
              <SelectItemText>
                <span :class="opt.type === 'commit' ? 'font-mono' : ''">{{ opt.label }}</span>
              </SelectItemText>
              <span v-if="opt.subject" class="op-mute truncate text-xs flex-1 min-w-0">{{ opt.subject }}</span>
              <span v-else class="flex-1" />
              <span v-if="ago(opt)" class="op-mute text-micro tabular-nums shrink-0">{{ ago(opt) }}</span>
            </SelectItem>
          </template>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
