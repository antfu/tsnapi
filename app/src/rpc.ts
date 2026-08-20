import type { MetaPayload, PayloadRequest, RefsPayload, WorkspacePayload } from './types.ts'
import { connectDevframe } from 'devframe/client'

let clientPromise: Promise<any> | undefined

export async function client(): Promise<any> {
  if (!clientPromise) {
    clientPromise = connectDevframe({
      // Two serving modes share this same bundle: the standalone CLI dev
      // server and the static build (`tsnapi ui[ build]`) serve
      // `__connection.json` at the site root, while `pnpm dev:ui`'s Vite
      // bridge (app/vite.config.ts) mounts it scoped under `/__<id>/`
      // instead — sharing Vite's own origin/root means it can't also own
      // the root path. Try root first (the common case), then the scoped
      // path as a fallback.
      baseURL: ['./', './__tsnapi-inspector/'],
    }).catch((cause) => {
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
