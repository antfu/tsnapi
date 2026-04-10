export interface AppOptions {
  name: string
  version?: string
  debug?: boolean
}

export function createApp(options: AppOptions): { name: string, version: string, start: () => void } {
  return {
    name: options.name,
    version: options.version ?? '0.0.0',
    start() {
      console.warn(`Starting ${options.name}`)
    },
  }
}
