export interface ServerOptions {
  port: number
  host?: string
  cors?: boolean
}

export interface Middleware {
  name: string
  handler: (req: unknown, res: unknown, next: () => void) => void
}

export class Server {
  private middlewares: Middleware[] = []
  private options: ServerOptions

  constructor(options: ServerOptions) {
    this.options = options
  }

  use(middleware: Middleware): this {
    this.middlewares.push(middleware)
    return this
  }

  async listen(): Promise<void> {
    console.warn(`Listening on ${this.options.host ?? 'localhost'}:${this.options.port}`)
  }

  close(): void {
    console.warn('Server closed')
  }
}

export function createServer(options: ServerOptions): Server {
  return new Server(options)
}
