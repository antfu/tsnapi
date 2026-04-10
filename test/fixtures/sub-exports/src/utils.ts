export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-')
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type StringTransform = (input: string) => string
