export interface ClientOptions {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}
export declare function createClient(_: ClientOptions): HttpClient;
export declare class HttpClient {
  private options;
  constructor(options: ClientOptions);
  get(path: string): Promise<Response>;
  post(path: string, body: unknown): Promise<Response>;
}
