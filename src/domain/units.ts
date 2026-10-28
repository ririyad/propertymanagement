// Meter units are whole numbers (decision D20).

export type ParseUnitsResult = { ok: true; value: number } | { ok: false; error: string }

/** Reads a whole number of units, allowing digit grouping commas: "12,450" gives 12450. */
export function parseUnits(text: string): ParseUnitsResult {
  const input = text.trim()
  if (input === '') return { ok: false, error: 'errors.units.required' }
  const digits = input.replaceAll(',', '')
  const value = Number(digits)
  if (!/^\d+$/.test(digits) || !Number.isSafeInteger(value)) {
    return { ok: false, error: 'errors.units.invalid' }
  }
  return { ok: true, value }
}
