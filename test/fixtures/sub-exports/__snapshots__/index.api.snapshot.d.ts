export interface AppOptions {
  name: string;
  version?: string;
  debug?: boolean;
}
export declare function createApp(_: AppOptions): {
  name: string;
  version: string;
  start: () => void;
};
export declare function createRouter(_?: RouterOptions): {
  add: (route: Route) => void;
  match: (path: string) => Route | undefined;
};
export interface Route {
  path: string;
  handler: () => void;
}
export interface RouterOptions {
  prefix?: string;
  routes?: Route[];
}
export declare const VERSION: string;
