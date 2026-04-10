// Interfaces
export interface Middleware {
  name: string;
  handler: (req: unknown, res: unknown, next: () => void) => void;
}
export interface ServerOptions {
  port: number;
  host?: string;
  cors?: boolean;
}

// Classes
export declare class Server {
  private middlewares;
  private options;
  constructor(options: ServerOptions);
  use(middleware: Middleware): this;
  listen(): Promise<void>;
  close(): void;
}

// Functions
export declare function createServer(_: ServerOptions): Server;