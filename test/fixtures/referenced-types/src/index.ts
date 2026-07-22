// Not exported — only reachable through the public API's type references.
interface RetryPolicy {
  attempts: number
  backoff: number
}

// Not exported, and only reachable transitively (RetryPolicy is depth 1 from
// the exports, this is depth 2).
type BackoffKind = 'linear' | 'exponential'

interface RetryPolicyWithKind extends RetryPolicy {
  kind: BackoffKind
}

export interface ClientOptions {
  baseUrl: string
  retry: RetryPolicyWithKind
}

export function createClient(options: ClientOptions): void {
  void options
}

export const defaultRetry: RetryPolicy = { attempts: 3, backoff: 100 }
