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
    'panel': 'bg-base border border-base rounded-lg shadow',
    // Named z-index layers. The design preset ships no z scale, so the layers
    // its overlays reference must be defined by the consumer.
    'z-nav': 'z-40',
    'z-dropdown': 'z-60',
    'z-panel-content': 'z-70',
    'z-drawer-backdrop': 'z-90',
    'z-drawer-content': 'z-100',
    'z-modal-backdrop': 'z-110',
    'z-modal-content': 'z-120',
    'z-toast': 'z-200',
  },
})
