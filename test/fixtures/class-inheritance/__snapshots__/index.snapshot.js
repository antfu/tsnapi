export class BaseLogger {
  info(_) {}
  warn(_) {}
}
export class BufferedLogger extends BaseLogger {
  buffer
  log(_) {}
  flush() {}
  get size() {}
}
export class ConsoleLogger extends BaseLogger {
  prefix
  constructor(_) {}
  log(_) {}
  static create(_) {}
}
export var LogLevel /* let */