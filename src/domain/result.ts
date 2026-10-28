/** Field name (e.g. `amount`, `entries.0.bp`) to the i18n key of its message (AGENT.md section 6). */
export type Errors = Record<string, string>

export type Result<T> = { ok: true; value: T } | { ok: false; errors: Errors }

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

export function fail(errors: Errors): { ok: false; errors: Errors } {
  return { ok: false, errors }
}

export function hasErrors(errors: Errors): boolean {
  return Object.keys(errors).length > 0
}
