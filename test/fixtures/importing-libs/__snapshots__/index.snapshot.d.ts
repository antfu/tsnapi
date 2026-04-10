// Interfaces
export interface FileOptions {
  encoding?: BufferEncoding;
  createDirs?: boolean;
}

// Types
export type PathLike = string | URL;

// Functions
export declare function fileExists(_: string): boolean;
export declare function joinPaths(..._: string[]): string;
export declare function readFile(_: string, _?: FileOptions): string;
export declare function writeFile(_: string, _: string, _?: FileOptions): void;