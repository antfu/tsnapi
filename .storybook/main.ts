import type { StorybookConfig } from '@storybook/vue3-vite'
import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../app/src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  // Storybook uses its own Vite config (not the app's), and `@storybook/vue3-vite`
  // does not add the Vue plugin itself, so wire Vue + UnoCSS (same config as the
  // app) here so the SFCs compile and the design tokens/icons resolve.
  viteFinal: config => mergeConfig(config, {
    plugins: [
      Vue(),
      Unocss({ configFile: fileURLToPath(new URL('../app/uno.config.ts', import.meta.url)) }),
    ],
  }),
}

export default config
