export declare function fileExists(_: string): boolean;
export interface FileOptions {
  encoding?: BufferEncoding;
  createDirs?: boolean;
}
export declare function joinPaths(..._: string[]): string;
export type PathLike = string | URL;
export declare function readFile(_: string, _?: FileOptions): string;
export declare function writeFile(_: string, _: string, _?: FileOptions): void;
