import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import unocss from 'unocss/vite'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  // Relative base so the built SPA is mount-path agnostic (devframe resolves
  // its endpoint at runtime from document.baseURI).
  base: './',
  plugins: [
    vue(),
    unocss({ configFile: fileURLToPath(new URL('./uno.config.ts', import.meta.url)) }),
  ],
  build: {
    outDir: fileURLToPath(new URL('../dist/ui', import.meta.url)),
    emptyOutDir: true,
    target: 'esnext',
  },
})
