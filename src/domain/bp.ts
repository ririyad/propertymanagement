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

export type ParsePercentResult = { ok: true; value: Bp } | { ok: false; error: string }

const PERCENT_PATTERN = /^(\d{1,3})?(?:\.(\d*))?$/

/** Parses a percentage typed by the user: `33.33` gives 3333 bp. At most 2 decimals, 0 to 100. */
export function parsePercent(text: string): ParsePercentResult {
  const input = text.trim().replace(/\s*%$/, '')
  if (input === '') return { ok: false, error: 'errors.percent.required' }

  const match = PERCENT_PATTERN.exec(input)
  const whole = match?.[1] ?? ''
  const fraction = match?.[2] ?? ''
  if (!match || (whole === '' && fraction === ''))
    return { ok: false, error: 'errors.percent.invalid' }
  if (fraction.length > 2) return { ok: false, error: 'errors.percent.tooManyDecimals' }

  const value = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'))
  if (value > BP_WHOLE) return { ok: false, error: 'errors.percent.outOfRange' }
  return { ok: true, value: bp(value) }
}
