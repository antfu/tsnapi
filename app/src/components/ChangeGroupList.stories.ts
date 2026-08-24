import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { sampleMembers } from '../mock.ts'
import ChangeGroupList from './ChangeGroupList.vue'

const meta = {
  title: 'Detail/ChangeGroupList',
  component: ChangeGroupList,
} satisfies Meta<typeof ChangeGroupList>

export default meta
type Story = StoryObj<typeof meta>

/** Changed members bucketed by status (removed -> narrowed -> widened -> added); unchanged members are dropped. */
export const Default: Story = {
  render: () => ({
    components: { ChangeGroupList },
    setup: () => ({ members: sampleMembers }),
    template: `
      <div class="w-72 border border-base rounded p-1">
        <ChangeGroupList :members="members" @select="(m) => console.log('select', m.name)" />
      </div>
    `,
  }),
}

/** No changed members — renders nothing (caller supplies its own empty state). */
export const NoChanges: Story = {
  render: () => ({
    components: { ChangeGroupList },
    setup: () => ({ members: sampleMembers.filter(m => m.status === 'unchanged') }),
    template: `<div class="w-72 border border-base rounded p-1"><ChangeGroupList :members="members" /></div>`,
  }),
}
