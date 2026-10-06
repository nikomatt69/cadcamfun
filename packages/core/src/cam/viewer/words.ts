/**
 * G-code word tokenizer shared by the CAM viewers (2D preview, editor statistics, 3D toolpath).
 *
 * The legacy viewers matched commands with `line.includes("G0")`, which also matched `G02`, `G03`, `G01`, `G10`,
 * `G12`, `G17`... and counted every line with an `M` anywhere (comments included). The viewers here tokenise a block
 * into letter/number words instead, so `G02` is an arc and not a rapid, and comments never count.
 */

export interface GWord {
  readonly letter: string
  readonly value: number
}

export interface GBlock {
  /** The words of the block in source order (`N` line numbers dropped). */
  readonly words: ReadonlyArray<GWord>
  /** The trailing `;` comment, without the `;`. */
  readonly comment: string
}

const WORD = /([A-Z])\s*([+-]?\d*\.?\d+)/gi

/** Strips `( ... )` comments and returns the part before a `;`, plus the `;` comment itself. */
export const splitComment = (line: string): { readonly code: string; readonly comment: string } => {
  const semi = line.indexOf(";")
  const code = (semi >= 0 ? line.slice(0, semi) : line).replace(/\([^)]*\)/g, " ")
  return { code, comment: semi >= 0 ? line.slice(semi + 1).trim() : "" }
}

/** Splits a block into words. Block-delete (`/`) lines and `%` program markers yield no words. */
export const tokenize = (line: string): GBlock => {
  const { code, comment } = splitComment(line.trim())
  if (code.trim().startsWith("%")) return { words: [], comment }
  const words: GWord[] = []
  for (const match of code.toUpperCase().matchAll(WORD)) {
    const letter = match[1]!
    if (letter === "N") continue
    words.push({ letter, value: Number.parseFloat(match[2]!) })
  }
  return { words, comment }
}

/** The values of every `letter` word in the block (a block may hold several `G`/`M` words). */
export const valuesOf = (block: GBlock, letter: string): number[] =>
  block.words.filter((word) => word.letter === letter).map((word) => word.value)

/** The last value of `letter`, or `undefined`. */
export const lastOf = (block: GBlock, letter: string): number | undefined => {
  const all = valuesOf(block, letter)
  return all.length > 0 ? all[all.length - 1] : undefined
}

/** True when the block holds the `G` word `code` (e.g. `1`, `13.1`). */
export const hasG = (block: GBlock, code: number): boolean => block.words.some((word) => word.letter === "G" && word.value === code)
