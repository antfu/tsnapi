import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { samplePayload } from '../mock.ts'
import SummaryPanel from './SummaryPanel.vue'

const meta = {
  title: 'Detail/SummaryPanel',
  component: SummaryPanel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SummaryPanel>

export default meta
type Story = StoryObj<typeof meta>

/** The "no selection" sidebar: from-ref to-ref summary + the changed entries. */
export const Default: Story = {
  render: () => ({
    components: { SummaryPanel },
    setup: () => ({ payload: samplePayload }),
    template: `
      <div class="relative bg-base" style="height: 560px; width: 520px">
        <SummaryPanel :payload="payload" @select-member="(m) => console.log('select', m.name)" />
      </div>
    `,
  }),
}
