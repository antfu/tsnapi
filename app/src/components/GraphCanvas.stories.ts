import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { sampleTree } from '../mock.ts'
import GraphCanvas from './GraphCanvas.vue'

const meta = {
  title: 'Graph/GraphCanvas',
  component: GraphCanvas,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GraphCanvas>

export default meta
type Story = StoryObj<typeof meta>

/** The d3-hierarchy tree with pan/zoom. Renders purely from a `root` datum. */
export const Default: Story = {
  render: () => ({
    components: { GraphCanvas },
    setup: () => ({ root: sampleTree }),
    template: `
      <div class="border border-base rounded overflow-hidden" style="height: 560px; width: 100%">
        <GraphCanvas :root="root" @select="(d) => console.log('select', d.id)" />
      </div>
    `,
  }),
}
