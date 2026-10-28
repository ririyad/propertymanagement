// Draws the app icon and renders the PNG sizes the web app manifest needs (AGENT.md 13).
// Run with `npm run icons` after changing the design; the output is committed.
import { writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const TEAL = '#0f766e'

// Two buildings, centred in a 512 × 512 canvas and inside the maskable safe zone (radius 205).
const glyph = `
  <g fill="#fff">
    <rect x="136" y="136" width="120" height="240" rx="6"/>
    <rect x="272" y="200" width="104" height="176" rx="6"/>
  </g>
  <g fill="${TEAL}">
    <rect x="160" y="164" width="24" height="24" rx="3"/>
    <rect x="208" y="164" width="24" height="24" rx="3"/>
    <rect x="160" y="210" width="24" height="24" rx="3"/>
    <rect x="208" y="210" width="24" height="24" rx="3"/>
    <rect x="160" y="256" width="24" height="24" rx="3"/>
    <rect x="208" y="256" width="24" height="24" rx="3"/>
    <rect x="178" y="312" width="36" height="64" rx="3"/>
    <rect x="292" y="228" width="24" height="24" rx="3"/>
    <rect x="332" y="228" width="24" height="24" rx="3"/>
    <rect x="292" y="274" width="24" height="24" rx="3"/>
    <rect x="332" y="274" width="24" height="24" rx="3"/>
    <rect x="306" y="320" width="36" height="56" rx="3"/>
  </g>`

const svg = (background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${background}${glyph}</svg>\n`

const rounded = svg(`<rect width="512" height="512" rx="112" fill="${TEAL}"/>`)
const fullBleed = svg(`<rect width="512" height="512" fill="${TEAL}"/>`)

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, source: rounded },
  { file: 'public/icons/icon-512.png', size: 512, source: rounded },
  { file: 'public/icons/icon-maskable-512.png', size: 512, source: fullBleed },
  { file: 'public/icons/apple-touch-icon-180.png', size: 180, source: fullBleed },
]

await writeFile('public/favicon.svg', rounded)

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  for (const { file, size, source } of targets) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<body style="margin:0">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
    )
    await page.locator('svg').screenshot({ path: file, omitBackground: true })
    console.log(`wrote ${file}`)
  }
} finally {
  await browser.close()
}
