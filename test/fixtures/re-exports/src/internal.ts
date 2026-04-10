export interface InternalOptions {
  verbose?: boolean
  timeout?: number
}

export function internalProcess(data: string, options?: InternalOptions): string {
  const prefix = options?.verbose ? '[verbose] ' : ''
  return `${prefix}${data}`
}

export class InternalService {
  private name: string
  constructor(name: string) {
    this.name = name
  }

  run(input: string): string {
    return `${this.name}: ${input}`
  }
}

export const INTERNAL_VERSION = '1.0.0'
