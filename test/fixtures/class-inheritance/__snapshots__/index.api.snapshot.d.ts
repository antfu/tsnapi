export declare abstract class BaseLogger {
  abstract log(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}
export declare class BufferedLogger extends BaseLogger {
  private buffer;
  log(message: string): void;
  flush(): string[];
  get size(): number;
}
export declare class ConsoleLogger extends BaseLogger {
  private prefix;
  constructor(prefix?: string);
  log(message: string): void;
  static create(prefix?: string): ConsoleLogger;
}
export interface LoggerFactory {
  create: (name: string) => BaseLogger;
}
export declare enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3
}
