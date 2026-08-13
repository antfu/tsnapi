import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { RefOption } from './RefSelect.vue'
import { ref } from 'vue'
import RefSelect from './RefSelect.vue'

const meta = {
  title: 'Toolbar/RefSelect',
  component: RefSelect,
} satisfies Meta<typeof RefSelect>

export default meta
type Story = StoryObj<typeof meta>

const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString()

const options: RefOption[] = [
  { value: 'WORKING_TREE', label: 'Working tree', type: 'working' },
  { value: 'HEAD', label: 'HEAD', type: 'head', subject: 'chore: release v1.2.0', date: daysAgo(0.04) },
  { value: '__h_branches', label: 'Branches', type: 'header', disabled: true },
  { value: 'main', label: 'main', type: 'branch', date: daysAgo(0.04) },
  { value: 'feat/ui', label: 'feat/ui', type: 'branch', date: daysAgo(1) },
  { value: '__h_tags', label: 'Tags', type: 'header', disabled: true },
  { value: 'v1.2.0', label: 'v1.2.0', type: 'tag', date: daysAgo(5) },
  { value: 'v1.1.0', label: 'v1.1.0', type: 'tag', date: daysAgo(40) },
  { value: '__h_commits', label: 'Commits touching snapshots', type: 'header', disabled: true },
  { value: 'a1b2c3d', label: 'a1b2c3d', type: 'commit', subject: 'feat: trace referenced types', date: daysAgo(2) },
  { value: 'e4f5a6b', label: 'e4f5a6b', type: 'commit', subject: 'fix: expand namespace members', date: daysAgo(3) },
]

export const Default: Story = {
  render: () => ({
    components: { RefSelect },
    setup: () => ({ options, model: ref('HEAD') }),
    template: `<div class="p-4"><RefSelect v-model="model" :options="options" placeholder="Base" /></div>`,
  }),
}
