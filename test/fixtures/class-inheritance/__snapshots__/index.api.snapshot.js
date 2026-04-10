export class BaseLogger {
  info(message) { /* ... */ }
  warn(message) { /* ... */ }
}
export class BufferedLogger extends BaseLogger {
  buffer
  log(message) { /* ... */ }
  flush() { /* ... */ }
  get size() { /* ... */ }
}
export class ConsoleLogger extends BaseLogger {
  prefix
  constructor(prefix) { /* ... */ }
  log(message) { /* ... */ }
  static create(prefix) { /* ... */ }
}
export var LogLevel /* let */
