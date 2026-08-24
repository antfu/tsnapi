import { diffLines } from 'diff'

/** A single row of a unified diff view. */
export interface DiffRow {
  kind: 'context' | 'add' | 'del'
  /** 1-based old-side line number (present for `context` and `del`). */
  oldNo?: number
  /** 1-based new-side line number (present for `context` and `add`). */
  newNo?: number
  /** 0-based index into the *old* side's line list (for `context`/`del`). */
  oldIndex?: number
  /** 0-based index into the *new* side's line list (for `context`/`add`). */
  newIndex?: number
  /** The raw line text (no trailing newline). */
  text: string
}

/** Split snapshot text into lines, dropping a single trailing empty line from a final newline. */
export function toLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '')
    lines.pop()
  return lines
}

/** Number of lines a jsdiff hunk value spans (its trailing `\n` doesn't add an extra line). */
function hunkLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines[lines.length - 1] === '')
    lines.pop()
  return lines
}

/**
 * Compute a unified, line-level diff of two texts as a flat row list. Each row
 * carries the line numbers for both gutters and the index into its side's line
 * list, so a caller can map pre-tokenized (syntax-highlighted) lines back onto
 * rows without re-tokenizing per row.
 */
export function computeDiffRows(before: string, after: string): DiffRow[] {
  const parts = diffLines(before, after)
  const rows: DiffRow[] = []
  let oldNo = 1
  let newNo = 1
  let oldIndex = 0
  let newIndex = 0

  for (const part of parts) {
    const lines = hunkLines(part.value)
    if (part.added) {
      for (const text of lines) {
        rows.push({ kind: 'add', newNo, newIndex, text })
        newNo++
        newIndex++
      }
    }
    else if (part.removed) {
      for (const text of lines) {
        rows.push({ kind: 'del', oldNo, oldIndex, text })
        oldNo++
        oldIndex++
      }
    }
    else {
      for (const text of lines) {
        rows.push({ kind: 'context', oldNo, newNo, oldIndex, newIndex, text })
        oldNo++
        newNo++
        oldIndex++
        newIndex++
      }
    }
  }

  return rows
}
