export type Formatter = (input: string) => string

export function uppercase(input: string): string {
  return input.toUpperCase()
}

export function lowercase(input: string): string {
  return input.toLowerCase()
}
