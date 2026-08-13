import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PierreFile from './PierreFile.vue'

const meta = {
  title: 'Detail/PierreFile',
  component: PierreFile,
} satisfies Meta<typeof PierreFile>

export default meta
type Story = StoryObj<typeof meta>

const code = `export declare function generateApiSnapshot(_: string, _?: object): Promise<{
  runtime: string;
  dts: string;
}>;`

/** A single (non-diff) signature, rendered via the same @pierre/diffs client component as PierreDiff. */
export const Default: Story = {
  render: () => ({
    components: { PierreFile },
    setup: () => ({ code }),
    template: `<div style="width: 460px"><PierreFile :code="code" :dark="true" /></div>`,
  }),
}
