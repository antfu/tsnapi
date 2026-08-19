import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { devframeViteBridge } from '@devframes/vite/single'
import vue from '@vitejs/plugin-vue'
import unocss from 'unocss/vite'
import { defineConfig } from 'vite'
import pkg from '../package.json' with { type: 'json' }
import { createInspectorDevframe } from '../src/ui/node/devframe.ts'

const root = fileURLToPath(new URL('.', import.meta.url))

// Definition used only to bridge the RPC + WS backend onto the Vite dev server
// (no distDir — Vite owns the SPA, giving HMR alongside a live backend).
const definition = createInspectorDevframe({
  version: pkg.version,
  cwd: process.cwd(),
  defaultBase: 'HEAD',
  defaultCompare: 'WORKING_TREE',
})

export default defineConfig({
  root,
  // Relative base so the built SPA is mount-path agnostic (devframe resolves
  // its endpoint at runtime from document.baseURI).
  base: './',
  plugins: [
    vue(),
    unocss({ configFile: fileURLToPath(new URL('./uno.config.ts', import.meta.url)) }),
    // Serves `__connection.json` + starts an RPC/WS side-car so `pnpm dev:ui`
    // has a working backend with hot-reload. Mounted under the scoped
    // `/__<id>/` base (matching `devframe.ts`'s `id: 'tsnapi-inspector'`) —
    // NOT at the site root: the bridge's node middleware owns every path
    // under its base outright (404s anything unrecognized there instead of
    // falling through), so a root base would swallow Vite's own SPA/asset
    // requests. `app/src/rpc.ts`'s `connectDevframe` call knows to look
    // here as a fallback after the root-relative path used by the other two
    // serving modes (the standalone CLI dev server, the static build).
    devframeViteBridge(definition, { auth: false, base: '/__tsnapi-inspector/' }),
  ],
  server: {
    // Bind to all interfaces so the preview is reachable from the host browser.
    host: '0.0.0.0',
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/ui', import.meta.url)),
    emptyOutDir: true,
    target: 'esnext',
  },
})
