<script setup lang="ts">
import type { PackageNode } from '../types.ts'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import OverlayDropdown from '@antfu/design/components/Overlay/OverlayDropdown.vue'
// `OverlayDropdownCheckboxItem` (@antfu/design) discards the underlying
// `select` event before re-emitting its own, so a consumer can never call
// `preventDefault()` on it — and without that, reka-ui's dropdown closes on
// every single toggle. Toggling *which packages to show* is exactly the
// case where you want to flip several checkboxes in one open menu, so this
// uses reka-ui's primitives directly (same ones the wrapper builds on,
// styled to match) purely to keep that `preventDefault()` available.
import { DropdownMenuCheckboxItem, DropdownMenuItemIndicator } from 'reka-ui'
import { computed } from 'vue'

// A dropdown of independent checkboxes, one per workspace package, toggling
// which packages the graph (and the API-changes summary) show. `modelValue`
// is the set of *hidden* package names — an empty set means every package
// is visible, so a package that only starts existing later (e.g. after a
// re-extract picks up a newly-added workspace member) defaults to visible
// with no extra bookkeeping, unlike a "selected" set that would default new
// packages to hidden.
const props = defineProps<{ packages: PackageNode[] }>()
const model = defineModel<Set<string>>({ required: true })

const visibleCount = computed(() => props.packages.filter(p => !model.value.has(p.name)).length)

function isVisible(name: string): boolean {
  return !model.value.has(name)
}

function setVisible(name: string, visible: boolean): void {
  const next = new Set(model.value)
  if (visible)
    next.delete(name)
  else
    next.add(name)
  model.value = next
}

function keepOpen(event: Event): void {
  event.preventDefault()
}
</script>

<template>
  <OverlayDropdown align="start">
    <template #trigger>
      <ActionButton size="sm" icon="i-ph-package">
        <span class="flex gap-1.5 items-center">
          Packages
          <span v-if="visibleCount < packages.length" class="badge-muted font-mono tabular-nums">{{ visibleCount }}/{{ packages.length }}</span>
        </span>
      </ActionButton>
    </template>
    <DropdownMenuCheckboxItem
      v-for="pkg in packages" :key="pkg.name"
      :model-value="isVisible(pkg.name)"
      class="text-sm color-base py-1.5 pl-7 pr-2 outline-none rounded-md flex gap-2 cursor-pointer select-none transition items-center relative data-[highlighted]:bg-hover"
      @select="keepOpen"
      @update:model-value="(v) => setVisible(pkg.name, v)"
    >
      <DropdownMenuItemIndicator class="color-active inline-flex items-center left-2 absolute">
        <span class="i-ph-check-bold" aria-hidden="true" />
      </DropdownMenuItemIndicator>
      <span class="truncate">{{ pkg.name }}</span>
    </DropdownMenuCheckboxItem>
  </OverlayDropdown>
</template>
