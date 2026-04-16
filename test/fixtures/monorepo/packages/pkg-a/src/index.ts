export interface Config {
  name: string
  enabled: boolean
}

export function createConfig(name: string): Config {
  return { name, enabled: true }
}

export const DEFAULT_NAME = 'default'
