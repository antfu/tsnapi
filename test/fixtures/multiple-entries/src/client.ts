export interface ClientOptions {
  baseUrl: string
  timeout?: number
  headers?: Record<string, string>
}

export class HttpClient {
  private options: ClientOptions

  constructor(options: ClientOptions) {
    this.options = options
  }

  async get(path: string): Promise<Response> {
    return fetch(`${this.options.baseUrl}${path}`, {
      headers: this.options.headers,
    })
  }

  async post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.options.baseUrl}${path}`, {
      method: 'POST',
      headers: this.options.headers,
      body: JSON.stringify(body),
    })
  }
}

export function createClient(options: ClientOptions): HttpClient {
  return new HttpClient(options)
}
