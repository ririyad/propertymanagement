/** An integer count of poisha (1 BDT = 100 poisha). Never a float (AGENT.md 0.2 rule 1). */
export type Poisha = number & { readonly __brand: 'Poisha' }

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/** Brands a safe integer as poisha. Throws on anything else; normalises -0 to 0. */
export function poisha(n: number): Poisha {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Not a safe integer amount of poisha: ${n}`)
  return (n === 0 ? 0 : n) as Poisha
}

export const ZERO = poisha(0)

export function add(a: Poisha, b: Poisha): Poisha {
  return poisha(a + b)
}

export function sub(a: Poisha, b: Poisha): Poisha {
  return poisha(a - b)
}

export function neg(a: Poisha): Poisha {
  return poisha(0 - a)
}

/** Amount times a whole number, e.g. units × rate. Throws if the result is not a safe integer. */
export function mulInt(a: Poisha, factor: number): Poisha {
  if (!Number.isSafeInteger(factor)) throw new RangeError(`Not a safe integer factor: ${factor}`)
  return poisha(a * factor)
}

export function sum(amounts: Iterable<Poisha>): Poisha {
  let total = ZERO
  for (const amount of amounts) total = add(total, amount)
  return total
}

/** Whole taka to poisha, e.g. fromTaka(8000) = 800000. */
export function fromTaka(taka: number): Poisha {
  return mulInt(poisha(taka), 100)
}

/** Splits an amount into sign, whole taka and remaining poisha, for display. */
export function toTakaParts(amount: Poisha): { negative: boolean; taka: number; poisha: number } {
  const digits = String(Math.abs(amount)).padStart(3, '0')
  return {
    negative: amount < 0,
    taka: Number(digits.slice(0, -2)),
    poisha: Number(digits.slice(-2)),
  }
}

export type ParseTakaResult = { ok: true; value: Poisha } | { ok: false; error: string }

const TAKA_PATTERN = /^(\d+(?:,\d+)*)?(?:\.(\d*))?$/

/**
 * Parses taka typed by the user: `1,500.5` gives 150050 poisha. Commas are allowed between
 * digits, at most 2 decimals, an optional leading ৳. The error is an i18n key.
 */
export function parseTaka(text: string): ParseTakaResult {
  const input = text.trim().replace(/^৳\s*/, '')
  if (input === '') return { ok: false, error: 'errors.money.required' }

  const match = TAKA_PATTERN.exec(input)
  const whole = match?.[1]?.replaceAll(',', '') ?? ''
  const fraction = match?.[2] ?? ''
  if (!match || (whole === '' && fraction === ''))
    return { ok: false, error: 'errors.money.invalid' }
  if (fraction.length > 2) return { ok: false, error: 'errors.money.tooManyDecimals' }

  const value = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'))
  if (value > MAX_SAFE) return { ok: false, error: 'errors.money.tooLarge' }
  return { ok: true, value: poisha(Number(value)) }
}
