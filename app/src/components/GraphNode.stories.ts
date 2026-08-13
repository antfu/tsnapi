import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { memberNode, sampleMembers, samplePackage, unbuiltPackage } from '../mock.ts'
import GraphNode from './GraphNode.vue'

const meta = {
  title: 'Graph/GraphNode',
  component: GraphNode,
} satisfies Meta<typeof GraphNode>

export default meta
type Story = StoryObj<typeof meta>

/** Every member status + kind, each showing its kind icon (left) and source icon (right). */
export const Members: Story = {
  render: () => ({
    components: { GraphNode },
    setup: () => ({ nodes: sampleMembers.map(memberNode) }),
    template: `
      <div class="flex flex-col gap-2 items-start">
        <div v-for="n in nodes" :key="n.id" class="h-7"><GraphNode :datum="n" /></div>
      </div>
    `,
  }),
}

export const Selected: Story = {
  render: () => ({
    components: { GraphNode },
    setup: () => ({ node: memberNode(sampleMembers[1]) }),
    template: `<div class="h-7"><GraphNode :datum="node" :selected="true" /></div>`,
  }),
}

export const Package: Story = {
  render: () => ({
    components: { GraphNode },
    setup: () => ({
      ok: { id: 'p1', type: 'package', label: samplePackage.name, pkg: samplePackage },
      unbuilt: { id: 'p2', type: 'package', label: unbuiltPackage.name, pkg: unbuiltPackage },
    }),
    template: `
      <div class="flex flex-col gap-2 items-start">
        <div class="h-7"><GraphNode :datum="ok" /></div>
        <div class="h-7"><GraphNode :datum="unbuilt" /></div>
      </div>
    `,
  }),
}

export const EntryAndGroup: Story = {
  render: () => ({
    components: { GraphNode },
    setup: () => ({
      entry: { id: 'e1', type: 'entry', label: './vitest', sub: '3' },
      group: { id: 'g1', type: 'group', label: 'Interfaces', kind: 'interface', sub: '5' },
      root: { id: 'r1', type: 'root', label: 'workspace' },
    }),
    template: `
      <div class="flex flex-col gap-2 items-start">
        <div class="h-7"><GraphNode :datum="root" /></div>
        <div class="h-7"><GraphNode :datum="entry" /></div>
        <div class="h-7"><GraphNode :datum="group" /></div>
      </div>
    `,
  }),
}
