// Lint rules that keep money exact and the domain pure (AGENT.md 0.2 rules 1 and 3).
// Kept apart from eslint.config.js so tests/lint/guards.test.ts can exercise them directly.

const floatMoney = [
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: 'Money is integer poisha: parse user input with parseTaka (AGENT.md 0.2 rule 1).',
  },
  {
    selector: "MemberExpression[object.name='Number'][property.name='parseFloat']",
    message: 'Money is integer poisha: parse user input with parseTaka (AGENT.md 0.2 rule 1).',
  },
  {
    selector: "MemberExpression[property.name='toFixed']",
    message:
      'No toFixed in domain, data or service code: format money with formatTaka (AGENT.md 0.2 rule 1).',
  },
]

const impureDomain = [
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: 'Domain code never reads the clock: pass today in (AGENT.md 0.2 rule 3).',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Domain code never reads the clock: pass today in (AGENT.md 0.2 rule 3).',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='round']",
    message:
      'Round money only with integer helpers in money.ts and split.ts (AGENT.md 0.2 rule 1).',
  },
]

const domainImports = {
  patterns: [
    {
      regex: '^(react|react-dom|react-router|react-i18next|i18next|dexie|dexie-react-hooks)(/|$)',
      message: 'src/domain is pure TypeScript: no React, Dexie or i18n (AGENT.md 0.2 rule 3).',
    },
    {
      regex: '^@/(?!domain(/|$))',
      message: 'src/domain may only import from src/domain (AGENT.md 0.2 rule 3).',
    },
    {
      regex: '^\\.\\./',
      message: 'Import other domain modules as @/domain/... (AGENT.md 0.2 rule 3).',
    },
  ],
}

/** @type {import('eslint').Linter.Config[]} */
export const layerGuards = [
  {
    files: ['src/data/**/*.{ts,tsx}', 'src/services/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...floatMoney] },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...floatMoney, ...impureDomain],
      'no-restricted-imports': ['error', domainImports],
    },
  },
]
