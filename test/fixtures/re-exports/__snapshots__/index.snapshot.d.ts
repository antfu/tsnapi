// Interfaces
export interface Options {
  verbose?: boolean;
  timeout?: number;
}

// Types
export type Formatter = (input: string) => string;

// Classes
export declare class Service {
  private name;
  constructor(name: string);
  run(input: string): string;
}

// Functions
export declare function formatOutput(_: string): string;
export declare function process(_: string, _?: InternalOptions): string;

// Variables
export declare const VERSION: string;