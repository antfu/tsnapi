import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import { noSnapshotPackage, samplePackage } from '../mock.ts'
import PackagesFilter from './PackagesFilter.vue'

const meta = {
  title: 'Toolbar/PackagesFilter',
  component: PackagesFilter,
} satisfies Meta<typeof PackagesFilter>

export default meta
type Story = StoryObj<typeof meta>

const packages = [samplePackage, noSnapshotPackage, { ...samplePackage, name: '@scope/pkg-c', dir: 'packages/pkg-c' }]

/** Every package visible (the default) — no count badge on the trigger. */
export const AllVisible: Story = {
  render: () => ({
    components: { PackagesFilter },
    setup: () => ({ packages, model: ref(new Set<string>()) }),
    template: `<div class="p-4"><PackagesFilter v-model="model" :packages="packages" /></div>`,
  }),
}

/** One package hidden — the trigger shows a "visible/total" count badge. */
export const SomeHidden: Story = {
  render: () => ({
    components: { PackagesFilter },
    setup: () => ({ packages, model: ref(new Set(['@scope/no-snapshot'])) }),
    template: `<div class="p-4"><PackagesFilter v-model="model" :packages="packages" /></div>`,
  }),
}
