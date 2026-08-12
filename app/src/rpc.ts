import type { MetaPayload, PayloadRequest, RefsPayload, WorkspacePayload } from './types.ts'
import { connectDevframe } from 'devframe/client'

let clientPromise: Promise<any> | undefined

async function client(): Promise<any> {
  if (!clientPromise) {
    clientPromise = connectDevframe().catch((cause) => {
      clientPromise = undefined
      throw new Error(
        'Could not reach the tsnapi backend (failed to load __connection.json).\n\n'
        + 'The inspector must be served by its own server. Run:\n'
        + '    tsnapi ui\n'
        + 'and open the URL it prints. A plain static file server has no backend.',
        { cause },
      )
    })
  }
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
