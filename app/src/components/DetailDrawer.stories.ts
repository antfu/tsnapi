import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { memberNode, sampleMembers, samplePackage } from '../mock.ts'
import DetailDrawer from './DetailDrawer.vue'

const meta = {
  title: 'Detail/DetailDrawer',
  component: DetailDrawer,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DetailDrawer>

export default meta
type Story = StoryObj<typeof meta>

const frame = `<div class="relative bg-base" style="height: 560px; width: 520px">STORY</div>`

function story(datum: unknown, isDiff: boolean): Story['render'] {
  return () => ({
    components: { DetailDrawer },
    setup: () => ({ datum, isDiff }),
    template: frame.replace('STORY', `<DetailDrawer :datum="datum" :is-diff="isDiff" @close="() => {}" />`),
  })
}

/** A member present in both runtime and types, single-state (no diff). */
export const MemberSignature: Story = { render: story(memberNode(sampleMembers[0]), false) }

/** A widened interface — before / after Shiki blocks. */
export const MemberWidened: Story = { render: story(memberNode(sampleMembers[1]), true) }

/** A narrowed (breaking) interface. */
export const MemberModified: Story = { render: story(memberNode(sampleMembers[2]), true) }

/** A removed export. */
export const MemberRemoved: Story = { render: story(memberNode(sampleMembers[4]), true) }

/** A package selection shows a status-count summary. */
export const PackageSummary: Story = {
  render: story({ id: 'pkg', type: 'package', label: samplePackage.name, pkg: samplePackage }, true),
}

/** An entry selection shows its changed members grouped by change type (ChangeGroupList). */
export const EntryMembers: Story = {
  render: story({ id: 'entry', type: 'entry', label: '.', children: sampleMembers.map(memberNode) }, true),
}
