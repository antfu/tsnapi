import type { MetaPayload, PayloadRequest, RefsPayload, WorkspacePayload } from './types.ts'
import { connectDevframe } from 'devframe/client'

let clientPromise: Promise<any> | undefined

async function client(): Promise<any> {
  if (!clientPromise)
    clientPromise = connectDevframe()
  return clientPromise
}

export async function getMeta(): Promise<MetaPayload> {
  return (await client()).call('tsnapi:get-meta')
}

export async function getRefs(all = false): Promise<RefsPayload> {
  return (await client()).call('tsnapi:get-refs', { all })
}

export async function getPayload(req: PayloadRequest): Promise<WorkspacePayload> {
  return (await client()).call('tsnapi:get-payload', req)
}
