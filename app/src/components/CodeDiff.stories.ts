import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CodeDiff from './CodeDiff.vue'

const meta = {
  title: 'Detail/CodeDiff',
  component: CodeDiff,
} satisfies Meta<typeof CodeDiff>

export default meta
type Story = StoryObj<typeof meta>

const before = `export interface ApiSnapshotOptions {
  outputDir?: string;
}`
const after = `export interface ApiSnapshotOptions {
  outputDir?: string;
  referenceTracingDepth?: number;
}`

/**
 * A widened interface, rendered as a unified line-level diff. Highlighting
 * comes from the shiki wire service at runtime; with no backend in Storybook
 * the diff structure renders with plain (un-highlighted) text.
 */
export const Widened: Story = {
  render: () => ({
    components: { CodeDiff },
    setup: () => ({ before, after }),
    template: `<div style="width: 460px"><CodeDiff :before="before" :after="after" /></div>`,
  }),
}
