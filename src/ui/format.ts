import { toTakaParts, type Poisha } from '@/domain/money'

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** Taka with lakh grouping, showing poisha only when there are any: ৳1,50,000 or ৳1,50,000.50. */
export function formatTaka(amount: Poisha): string {
  const { negative, taka, poisha } = toTakaParts(amount)
  const fraction = poisha === 0 ? '' : `.${String(poisha).padStart(2, '0')}`
  return `${negative ? '-' : ''}৳${grouping.format(taka)}${fraction}`
}
