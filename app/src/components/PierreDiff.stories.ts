import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PierreDiff from './PierreDiff.vue'

const meta = {
  title: 'Detail/PierreDiff',
  component: PierreDiff,
} satisfies Meta<typeof PierreDiff>

export default meta
type Story = StoryObj<typeof meta>

const before = `export interface ApiSnapshotOptions {
  outputDir?: string;
}`
const after = `export interface ApiSnapshotOptions {
  outputDir?: string;
  referenceTracingDepth?: number;
}`

/** A widened interface, rendered via the @pierre/diffs client component. */
export const Widened: Story = {
  render: () => ({
    components: { PierreDiff },
    setup: () => ({ before, after }),
    template: `<div style="width: 460px"><PierreDiff :before="before" :after="after" :dark="true" /></div>`,
  }),
}
