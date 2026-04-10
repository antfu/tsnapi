export function formatOutput(value: string): string {
  return value.trim().toLowerCase()
}

export type Formatter = (input: string) => string
