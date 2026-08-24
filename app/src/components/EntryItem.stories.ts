import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { sampleMembers } from '../mock.ts'
import EntryItem from './EntryItem.vue'

const meta = {
  title: 'Detail/EntryItem',
  component: EntryItem,
} satisfies Meta<typeof EntryItem>

export default meta
type Story = StoryObj<typeof meta>

/** A single entry row (kind icon, name, source icon, status). */
export const Single: Story = {
  render: () => ({
    components: { EntryItem },
    setup: () => ({ member: sampleMembers[1] }),
    template: `<div class="w-72"><EntryItem :member="member" /></div>`,
  }),
}

/** A list of rows, one per status. */
export const List: Story = {
  render: () => ({
    components: { EntryItem },
    setup: () => ({ members: sampleMembers }),
    template: `
      <div class="w-72 border border-base rounded p-1">
        <EntryItem v-for="m in members" :key="m.name" :member="m" />
      </div>
    `,
  }),
}
