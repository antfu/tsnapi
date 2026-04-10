export abstract class BaseLogger {
  abstract log(message: string): void

  info(message: string): void {
    this.log(`[INFO] ${message}`)
  }

  warn(message: string): void {
    this.log(`[WARN] ${message}`)
  }
}

export class ConsoleLogger extends BaseLogger {
  private prefix: string

  constructor(prefix: string = '') {
    super()
    this.prefix = prefix
  }

  log(message: string): void {
    console.warn(`${this.prefix}${message}`)
  }

  static create(prefix?: string): ConsoleLogger {
    return new ConsoleLogger(prefix)
  }
}

export class BufferedLogger extends BaseLogger {
  private buffer: string[] = []

  log(message: string): void {
    this.buffer.push(message)
  }

  flush(): string[] {
    const result = [...this.buffer]
    this.buffer = []
    return result
  }

  get size(): number {
    return this.buffer.length
  }
}

export interface LoggerFactory {
  create: (name: string) => BaseLogger
}

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}
