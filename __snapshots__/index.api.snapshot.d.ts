export declare function a(_: string): ResolvedEntry[];
export interface c {
  runtime: string;
  dts: string;
}
export declare function d(_: string, _: SnapshotFile, _: SnapshotFile): SnapshotMismatch | null;
export declare function f(_: SnapshotMismatch[], _: string, _: SnapshotExtensions): string;
export declare function i(_: string, _: string): string;
export interface l {
  runtime: string;
  dts: string;
}
export declare function m(_: string, _: string, _: SnapshotFile, _: SnapshotExtensions): void;
export declare function n(_: string, _: string, _?: ApiSnapshotOptions): SnapshotResult;
export declare function o(_: string, _: string): string;
export declare function p(_: string, _: string, _: SnapshotExtensions): SnapshotFile | null;
export declare function r(_: string, _?: ApiSnapshotOptions): SnapshotResult;
export declare function s(_: string, _: string): string;
export declare function t(_: {
  name: string;
  runtime?: string;
  dts?: string;
}[], _: string, _?: ApiSnapshotOptions): SnapshotResult;
export interface u {
  entryName: string;
  runtimeDiff: string | null;
  dtsDiff: string | null;
}
