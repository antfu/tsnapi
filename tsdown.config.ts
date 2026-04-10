import { defineConfig } from 'tsdown'
import ApiSnapshot from './src/rolldown.ts'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/rolldown.ts',
    'src/cli.ts',
  ],
  dts: true,
  exports: true,
  plugins: [ApiSnapshot()],
})
