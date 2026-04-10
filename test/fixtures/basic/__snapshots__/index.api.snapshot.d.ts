export declare const DEBUG: boolean;
export declare function fetchData(_: string, _?: RequestInit): Promise<Response>;
export type Formatter = (input: string) => string;
export declare function greet(_: string): string;
export interface GreetOptions {
  prefix?: string;
  suffix?: string;
}
export declare function range(_: number, _: number): Generator<number>;
export declare const VERSION: string;
