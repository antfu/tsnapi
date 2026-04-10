import { defineConfig } from 'tsdown'
import ApiSnapshot from '../../../src/rolldown.ts'

export default defineConfig({
  entry: ['src/client.ts', 'src/server.ts'],
  dts: true,
  plugins: [ApiSnapshot({ outputDir: '__snapshots__' })],
})
