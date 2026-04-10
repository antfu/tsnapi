import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  ignores: [
    '__snapshots__',
    'fixtures',
    'README.md',
  ],
})
