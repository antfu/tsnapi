export interface ApiSnapshotOptions {
  outputDir?: string;
  extensionRuntime?: string;
  extensionDts?: string;
  update?: boolean;
}
export declare function compareSnapshots(_: string, _: SnapshotFile, _: SnapshotFile): SnapshotMismatch | null;
export declare function extractDts(_: string, _: string, _?: Map<string, string>): string;
export declare function extractRuntime(_: string, _: string, _?: Map<string, string>): string;
export declare function formatMismatchError(_: SnapshotMismatch[], _: string, _: SnapshotExtensions): string;
export declare function generateApiSnapshot(_: string): Record<string, {
  runtime: string;
  dts: string;
}>;
export declare function readSnapshot(_: string, _: string, _: SnapshotExtensions): SnapshotFile | null;
export interface ResolvedEntry {
  name: string;
  runtime: string | null;
  dts: string | null;
}
export declare function resolvePackageEntries(_: string): ResolvedEntry[];
export interface SnapshotExtensions {
  runtime: string;
  dts: string;
}
export interface SnapshotFile {
  runtime: string;
  dts: string;
}
export declare function snapshotFiles(_: {
  name: string;
  runtime?: string;
  dts?: string;
}[], _: string, _?: ApiSnapshotOptions): SnapshotResult;
export interface SnapshotMismatch {
  entryName: string;
  runtimeDiff: string | null;
  dtsDiff: string | null;
}
export declare function snapshotPackage(_: string, _?: ApiSnapshotOptions): SnapshotResult;
export interface SnapshotResult {
  hasChanges: boolean;
  mismatches: {
    name: string;
    runtimeChanged: boolean;
    dtsChanged: boolean;
  }[];
  diff: string | null;
}
export declare function writeSnapshot(_: string, _: string, _: SnapshotFile, _: SnapshotExtensions): void;
