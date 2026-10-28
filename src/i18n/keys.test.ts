import { describe, expect, it } from 'vitest'
import en from './en.json'

// Domain and service code return error messages as i18n keys (AGENT.md section 6).
const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[part]
      : undefined
  }, en)
}

describe('en.json', () => {
  const keys = new Set<string>()
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/['"`](errors\.[\w.]+)['"`]/g)) keys.add(match[1] ?? '')
  }

  it('finds error keys in the source', () => {
    expect(keys.size).toBeGreaterThan(0)
  })

  it.each([...keys])('has a message for %s', (key) => {
    expect(typeof lookup(key)).toBe('string')
  })
})
