/** Basis points: an integer share where 10000 = 100% (AGENT.md 0.2 rule 2). */
export type Bp = number & { readonly __brand: 'Bp' }

export const BP_WHOLE = 10000

export function isBp(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= BP_WHOLE
}

/** Brands an integer from 0 to 10000 as basis points. Throws on anything else. */
export function bp(n: number): Bp {
  if (!isBp(n)) throw new RangeError(`Not a basis-point value: ${n}`)
  return n as Bp
}

export function totalBp(values: Iterable<number>): number {
  let total = 0
  for (const value of values) total += value
  return total
}
