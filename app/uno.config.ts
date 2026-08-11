import { presetAnthonyDesign } from '@antfu/design/unocss'
import { defineConfig, presetIcons, presetWind4, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
  presets: [
    // Plain numeric z-index utilities are used in a couple of overlays here,
    // so opt out of the design preset's z-index guardrail.
    presetAnthonyDesign({ primary: '#3b82f6', blocklists: { plainZIndex: false } }),
    presetWind4(),
    presetIcons({ scale: 1.15, warn: true }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  shortcuts: {
    'btn': 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-base bg-base hover:bg-active transition-colors text-sm select-none cursor-pointer',
    'btn-active': 'bg-primary/15 border-primary/40 text-primary',
    'panel': 'bg-base border border-base rounded-lg shadow',
  },
})
