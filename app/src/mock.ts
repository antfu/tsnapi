import type { TreeDatum } from './tree.ts'
import type { DiffStatus, EntryKind, MemberNode, PackageNode, WorkspacePayload } from './types.ts'

// Static fixtures for Storybook / isolated component development. No runtime
// data, no side effects — just plain objects shaped like the wire payload.

export function mockMember(over: Partial<MemberNode> & { name: string, kind: EntryKind }): MemberNode {
  return {
    display: over.name,
    referenced: false,
    status: 'unchanged',
    current: { dts: `export declare const ${over.name}: unknown;` },
    ...over,
  }
}

export const sampleMembers: MemberNode[] = [
  mockMember({
    name: 'generateApiSnapshot',
    kind: 'function',
    status: 'unchanged',
    current: {
      dts: 'export declare function generateApiSnapshot(_: string, _?: object): Promise<{\n  runtime: string;\n  dts: string;\n}>;',
      runtime: 'export async function generateApiSnapshot(_, _) {}',
    },
  }),
  mockMember({
    name: 'ApiSnapshotOptions',
    kind: 'interface',
    status: 'widened',
    base: { dts: 'export interface ApiSnapshotOptions {\n  outputDir?: string;\n}' },
    current: { dts: 'export interface ApiSnapshotOptions {\n  outputDir?: string;\n  referenceTracingDepth?: number;\n}' },
  }),
  mockMember({
    name: 'SnapshotResult',
    kind: 'interface',
    status: 'modified',
    base: { dts: 'export interface SnapshotResult {\n  hasChanges: boolean;\n  diff: string;\n}' },
    current: { dts: 'export interface SnapshotResult {\n  hasChanges: boolean;\n}' },
  }),
  mockMember({
    name: 'compareSnapshots',
    kind: 'function',
    status: 'added',
    current: {
      dts: 'export declare function compareSnapshots(_: string, _: object, _: object): object | null;',
      runtime: 'export function compareSnapshots(_, _, _) {}',
    },
  }),
  mockMember({
    name: 'legacyExtract',
    kind: 'function',
    status: 'removed',
    base: { dts: 'export declare function legacyExtract(_: string): string;', runtime: 'export function legacyExtract(_) {}' },
  }),
  mockMember({ name: 'VERSION', kind: 'variable', status: 'unchanged', current: { runtime: 'export var VERSION /* const */', dts: 'export declare const VERSION: string;' } }),
  mockMember({ name: 'ResolvedEntry', kind: 'type', status: 'unchanged' }),
]

export function memberNode(m: MemberNode): TreeDatum {
  return { id: `member::${m.name}`, type: 'member', label: m.display, kind: m.kind, status: m.status, member: m }
}

function counts(over: Partial<Record<DiffStatus, number>> = {}): Record<DiffStatus, number> {
  return { added: 0, removed: 0, modified: 0, widened: 0, unchanged: 0, ...over }
}

export const samplePackage: PackageNode = {
  name: 'tsnapi',
  dir: '.',
  entries: [],
  status: 'ok',
  usedFallback: false,
  counts: counts({ added: 1, widened: 2, unchanged: 27 }),
}

export const unbuiltPackage: PackageNode = {
  name: '@scope/unbuilt',
  dir: 'packages/unbuilt',
  entries: [],
  status: 'unbuilt',
  usedFallback: true,
  counts: counts({ unchanged: 4 }),
}

const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString()

/** A full workspace payload (a diff from a tag to the working tree). */
export const samplePayload: WorkspacePayload = {
  root: '/repo/warm-zebras-fail',
  isDiff: true,
  git: true,
  base: {
    kind: 'ref',
    ref: 'v1.1.0',
    label: 'v1.1.0',
    resolved: { sha: '8e5981afeea3', shortSha: '8e5981a', name: 'v1.1.0', type: 'tag', subject: 'chore: release v1.1.0', date: daysAgo(5) },
  },
  compare: { kind: 'working', ref: 'WORKING_TREE', label: 'Working tree' },
  packages: [
    { ...samplePackage, entries: [{ name: '.', members: sampleMembers }] },
    unbuiltPackage,
  ],
  options: { omitArgumentNames: true, typeWidening: true, referenceTracingDepth: 1 },
}

/** A small hierarchy for the GraphCanvas story. */
export const sampleTree: TreeDatum = {
  id: '__root__',
  type: 'root',
  label: 'workspace',
  children: [
    {
      id: 'tsnapi',
      type: 'package',
      label: 'tsnapi',
      pkg: samplePackage,
      sub: '.',
      children: [
        {
          id: 'tsnapi::.',
          type: 'entry',
          label: '.',
          sub: String(sampleMembers.length),
          children: sampleMembers.map(memberNode),
        },
      ],
    },
    {
      id: '@scope/unbuilt',
      type: 'package',
      label: '@scope/unbuilt',
      pkg: unbuiltPackage,
      sub: 'packages/unbuilt',
      children: [],
    },
  ],
}
