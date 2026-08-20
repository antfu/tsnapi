import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CodeBlock from './CodeBlock.vue'

const meta = {
  title: 'Detail/CodeBlock',
  component: CodeBlock,
} satisfies Meta<typeof CodeBlock>

export default meta
type Story = StoryObj<typeof meta>

const code = `export declare function generateApiSnapshot(_: string, _?: object): Promise<{
  runtime: string;
  dts: string;
}>;`

/**
 * A single (non-diff) signature. Highlighting comes from the shiki wire
 * service at runtime; with no backend in Storybook it renders as plain text.
 */
export const Default: Story = {
  render: () => ({
    components: { CodeBlock },
    setup: () => ({ code }),
    template: `<div style="width: 460px"><CodeBlock :code="code" /></div>`,
  }),
}
