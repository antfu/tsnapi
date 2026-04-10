export declare function formatOutput(_: string): string;
export type Formatter = (input: string) => string;
export interface Options {
  verbose?: boolean;
  timeout?: number;
}
export declare function process(_: string, _?: InternalOptions): string;
export declare class Service {
  private name;
  constructor(name: string);
  run(input: string): string;
}
export declare const VERSION: string;
