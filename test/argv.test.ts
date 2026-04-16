import { describe, expect, it } from 'vitest'
import { hasArgvFlag } from '../src/core/argv.ts'

describe('hasArgvFlag', () => {
  it('matches exact long flag', () => {
    expect(hasArgvFlag(['--update-snapshot'], '--update-snapshot')).toBe(true)
  })

  it('matches long flag with = value', () => {
    expect(hasArgvFlag(['--update-snapshot=true'], '--update-snapshot')).toBe(true)
    expect(hasArgvFlag(['--update-snapshot=1'], '--update-snapshot')).toBe(true)
  })

  it('matches short flag', () => {
    expect(hasArgvFlag(['-u'], '--update-snapshot', '-u')).toBe(true)
  })

  it('returns false when flag is absent', () => {
    expect(hasArgvFlag(['--verbose', '--format', 'json'], '--update-snapshot', '-u')).toBe(false)
  })

  it('returns false for empty args', () => {
    expect(hasArgvFlag([], '--update-snapshot', '-u')).toBe(false)
  })

  it('stops scanning at -- separator', () => {
    expect(hasArgvFlag(['--', '--update-snapshot'], '--update-snapshot')).toBe(false)
    expect(hasArgvFlag(['--', '-u'], '--update-snapshot', '-u')).toBe(false)
    expect(hasArgvFlag(['--verbose', '--', '-u'], '--update-snapshot', '-u')).toBe(false)
  })

  it('matches flag before -- separator', () => {
    expect(hasArgvFlag(['--update-snapshot', '--', 'file.txt'], '--update-snapshot')).toBe(true)
    expect(hasArgvFlag(['-u', '--', 'file.txt'], '--update-snapshot', '-u')).toBe(true)
  })

  it('does not match substring of long flag', () => {
    expect(hasArgvFlag(['--update-snapshot-all'], '--update-snapshot')).toBe(false)
    expect(hasArgvFlag(['--update'], '--update-snapshot')).toBe(false)
  })

  it('does not match short flag inside combined flags', () => {
    expect(hasArgvFlag(['-au'], '--update-snapshot', '-u')).toBe(false)
    expect(hasArgvFlag(['-ua'], '--update-snapshot', '-u')).toBe(false)
  })

  it('matches among other flags', () => {
    expect(hasArgvFlag(['--verbose', '--update-snapshot', '--format', 'json'], '--update-snapshot')).toBe(true)
    expect(hasArgvFlag(['--verbose', '-u', '--format', 'json'], '--update-snapshot', '-u')).toBe(true)
  })

  it('works without short flag parameter', () => {
    expect(hasArgvFlag(['-u'], '--update-snapshot')).toBe(false)
    expect(hasArgvFlag(['--update-snapshot'], '--update-snapshot')).toBe(true)
  })
})
