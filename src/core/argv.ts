/**
 * Check whether a CLI flag is present in an argument list.
 *
 * Respects the `--` end-of-flags separator and handles `--flag=value` forms.
 */
export function hasArgvFlag(args: string[], long: string, short?: string): boolean {
  for (const arg of args) {
    if (arg === '--')
      break
    if (arg === long || arg.startsWith(`${long}=`))
      return true
    if (short && arg === short)
      return true
  }
  return false
}
