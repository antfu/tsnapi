export interface Route {
  path: string
  handler: () => void
}

export interface RouterOptions {
  prefix?: string
  routes?: Route[]
}

export function createRouter(options?: RouterOptions): { add: (route: Route) => void, match: (path: string) => Route | undefined } {
  const routes: Route[] = options?.routes ?? []
  return {
    add(route: Route) {
      routes.push(route)
    },
    match(path: string) {
      return routes.find(r => r.path === path)
    },
  }
}
