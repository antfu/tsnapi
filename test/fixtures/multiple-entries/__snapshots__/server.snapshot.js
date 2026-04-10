export function createServer(options) { /* ... */ }
export class Server {
  middlewares
  options
  constructor(options) { /* ... */ }
  use(middleware) { /* ... */ }
  async listen() { /* ... */ }
  close() { /* ... */ }
}
