import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  ignores: [
    'fixtures',
    // Hand-written bundler output, kept verbatim
    'test/fixtures/chunk-reexports/*/lib',
  ],
})
