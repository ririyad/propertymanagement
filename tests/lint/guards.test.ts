// Proves the lint guards of AGENT.md 0.2 (Phase 0 acceptance: lint fails on parseFloat or
// toFixed in domain, data or service code).
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'
import { layerGuards } from '../../eslint.guards.js'

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
    ...layerGuards,
  ],
})

async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`)
}

const floatMoney = [
  'export const a = parseFloat("1.5")',
  'export const a = Number.parseFloat("1.5")',
  'export const a = (1.5).toFixed(2)',
  'export const f = (n: number) => n.toFixed',
]

describe.each(['src/domain/x.ts', 'src/data/x.ts', 'src/services/x.ts'])('%s', (filePath) => {
  it.each(floatMoney)('rejects %s', async (code) => {
    expect(await violations(filePath, code)).toEqual(['no-restricted-syntax'])
  })
})

describe('src/domain', () => {
  const file = 'src/domain/x.ts'

  it.each([
    'export const now = Date.now()',
    'export const now = new Date()',
    'export const r = Math.round(1.5)',
  ])('rejects %s', async (code) => {
    expect(await violations(file, code)).toEqual(['no-restricted-syntax'])
  })

  it.each([
    "import React from 'react'",
    "import { createRoot } from 'react-dom/client'",
    "import { Dexie } from 'dexie'",
    "import i18n from 'i18next'",
    "import { db } from '@/data/db'",
    "import { cn } from '@/ui/cn'",
    "import { poisha } from '../domain/money'",
  ])('rejects %s', async (code) => {
    expect(await violations(file, code)).toEqual(['no-restricted-imports'])
  })

  it('allows pure code and domain imports', async () => {
    const code = [
      "import { poisha } from '@/domain/money'",
      "import { bp } from './bp'",
      "import { describe } from 'vitest'",
      'export const d = new Date(Date.UTC(2026, 0, 1))',
    ].join('\n')
    expect(await violations(file, code)).toEqual([])
  })
})

describe('other code', () => {
  it('may format with toFixed outside domain, data and services', async () => {
    expect(await violations('src/ui/x.ts', 'export const a = (1.5).toFixed(2)')).toEqual([])
  })
})
