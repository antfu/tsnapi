import type { Preview } from '@storybook/vue3-vite'
import '@antfu/design/styles.css'
import 'virtual:uno.css'
import '../app/src/main.css'

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
  },
  initialGlobals: {
    theme: 'dark',
  },
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (story, context) => {
      const dark = context.globals.theme !== 'light'
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
      return { components: { story }, template: '<story />' }
    },
  ],
}

export default preview
