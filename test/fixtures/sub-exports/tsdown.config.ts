import { defineConfig } from 'tsdown'
import ApiSnapshot from '../../../src/rolldown.ts'

export default defineConfig({
  entry: ['src/index.ts', 'src/utils.ts'],
  dts: true,
  plugins: [ApiSnapshot({ outputDir: '__snapshots__' })],
})
