import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { newRecord } from '@/data/records'
import { listAllocations } from '@/data/repositories/expenses'
import { getTemplate, listDrafts } from '@/data/repositories/recurring'
import { poisha } from '@/domain/money'
import { isoDate } from '@/domain/period'
import type { Attachment } from '@/domain/types'
import { ELECTRICITY_CATEGORY_ID } from '@/services/categories'
import { deleteExpense, skipDraft, unskipDraft } from '@/services/expenses'
import {
  confirmDraftAs,
  confirmDrafts,
  deleteTemplate,
  generateDrafts,
  restoreTemplate,
  saveTemplate,
  type TemplateInput,
} from '@/services/recurring'
import { cleanUpPhotoBlobs, runRollover } from '@/services/rollover'
import { resetDb, seedBuildingA, seedSystemCategories, unwrap } from '@/test/db'

const today = isoDate('2026-10-15')
const CARETAKER = 'system-caretaker'

beforeEach(async () => {
  await resetDb()
  await seedSystemCategories()
})

async function setup(overrides: Partial<TemplateInput> = {}) {
  const seeded = await seedBuildingA()
  const input: TemplateInput = {
    buildingId: seeded.building.id,
    categoryId: CARETAKER,
    amount: poisha(800000),
    frequency: 'MONTHLY',
    startPeriod: '2026-08',
    dueDay: 5,
    splitRule: 'BY_SHARE',
    isActive: true,
    ...overrides,
  }
  return { ...seeded, input }
}

async function drafts(templateId: string) {
  return (await db.expense.where('templateId').equals(templateId).toArray()).sort((a, b) =>
    a.period.localeCompare(b.period),
  )
}

describe('saveTemplate and generateDrafts (AGENT.md 8.6)', () => {
  it('creates a draft for each month from the start up to this month', async () => {
    const { input, o1 } = await setup({ defaultPaidByOwnerId: undefined })
    const template = unwrap(await saveTemplate(input, today))
    const created = await drafts(template.id)
    expect(created.map((d) => [d.period, d.date])).toEqual([
      ['2026-08', '2026-08-05'],
      ['2026-09', '2026-09-05'],
      ['2026-10', '2026-10-05'],
    ])
    expect(created[0]).toMatchObject({
      status: 'DRAFT',
      source: 'RECURRING',
      amount: 800000,
      splitRule: 'BY_SHARE',
      categoryId: CARETAKER,
      isPaid: false,
      paidByOwnerId: null,
    })
    expect(await listAllocations(created[0]?.id ?? '')).toEqual([])

    // A default payer marks the drafts paid by that owner (D44).
    const paid = unwrap(
      await saveTemplate({ ...input, startPeriod: '2026-10', defaultPaidByOwnerId: o1.id }, today),
    )
    expect(await drafts(paid.id)).toMatchObject([{ isPaid: true, paidByOwnerId: o1.id }])
  })

  it('never creates a month twice, even after it was skipped or deleted', async () => {
    const { input } = await setup()
    const template = unwrap(await saveTemplate(input, today))
    const [august, september] = await drafts(template.id)
    unwrap(await skipDraft(august?.id ?? ''))
    unwrap(await deleteExpense(september?.id ?? ''))
    expect(await generateDrafts(today)).toBe(0)
    expect(await generateDrafts(isoDate('2026-11-01'))).toBe(1)
    expect(await drafts(template.id)).toHaveLength(4)
  })

  it('follows the frequency, the end month and the active flag', async () => {
    const { input } = await setup({ startPeriod: '2026-01', frequency: 'QUARTERLY' })
    const quarterly = unwrap(await saveTemplate(input, today))
    expect((await drafts(quarterly.id)).map((d) => d.period)).toEqual([
      '2026-01',
      '2026-04',
      '2026-07',
      '2026-10',
    ])
    const ended = unwrap(
      await saveTemplate({ ...input, frequency: 'MONTHLY', endPeriod: '2026-02' }, today),
    )
    expect((await drafts(ended.id)).map((d) => d.period)).toEqual(['2026-01', '2026-02'])
    const inactive = unwrap(await saveTemplate({ ...input, isActive: false }, today))
    expect(await drafts(inactive.id)).toEqual([])
  })

  it('validates the template', async () => {
    const { input } = await setup()
    expect(
      await saveTemplate(
        {
          ...input,
          amount: poisha(0),
          dueDay: 29,
          endPeriod: '2026-07',
          splitRule: 'SINGLE_OWNER',
        },
        today,
      ),
    ).toEqual({
      ok: false,
      errors: {
        amount: 'errors.expense.amountPositive',
        dueDay: 'errors.template.dueDayInvalid',
        endPeriod: 'errors.template.endBeforeStart',
        splitRule: 'errors.category.splitRuleInvalid',
      },
    })
    expect(await saveTemplate({ ...input, categoryId: ELECTRICITY_CATEGORY_ID }, today)).toEqual({
      ok: false,
      errors: { categoryId: 'errors.template.categoryInvalid' },
    })
    expect(await saveTemplate({ ...input, defaultPaidByOwnerId: 'nobody' }, today)).toEqual({
      ok: false,
      errors: { defaultPaidByOwnerId: 'errors.template.payerInvalid' },
    })
  })
})

describe('confirming drafts', () => {
  it('confirms a draft with an edited amount and payer, creating its allocations', async () => {
    const { input, o1, o2, o3 } = await setup()
    const template = unwrap(await saveTemplate(input, today))
    const [august] = await drafts(template.id)
    const confirmed = unwrap(
      await confirmDraftAs(
        { id: august?.id ?? '', amount: poisha(10001), isPaid: true, paidByOwnerId: o2.id },
        today,
      ),
    )
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', amount: 10001, paidByOwnerId: o2.id })
    const allocations = await listAllocations(confirmed.id)
    expect(Object.fromEntries(allocations.map((a) => [a.ownerId, a.amount]))).toEqual({
      [o1.id]: 5001,
      [o2.id]: 3000,
      [o3.id]: 2000,
    })
    expect((await getTemplate(template.id))?.amount).toBe(800000)
    expect(
      await confirmDraftAs({
        id: confirmed.id,
        amount: poisha(1),
        isPaid: false,
        paidByOwnerId: null,
      }),
    ).toEqual({ ok: false, errors: { expense: 'errors.expense.notDraft' } })
  })

  it('uses the amount from now on when asked, for the template and its later drafts', async () => {
    const { input } = await setup()
    const template = unwrap(await saveTemplate(input, today))
    const [august, september, october] = await drafts(template.id)
    unwrap(
      await confirmDraftAs(
        {
          id: september?.id ?? '',
          amount: poisha(850000),
          isPaid: false,
          paidByOwnerId: null,
          useFromNowOn: true,
        },
        today,
      ),
    )
    expect((await getTemplate(template.id))?.amount).toBe(850000)
    expect((await drafts(template.id)).map((d) => [d.id, d.amount])).toEqual([
      [august?.id, 800000],
      [september?.id, 850000],
      [october?.id, 850000],
    ])
  })

  it('confirms several drafts and reports errors by draft', async () => {
    const { input, building } = await setup({ startPeriod: '2025-12' })
    const template = unwrap(await saveTemplate({ ...input, buildingId: building.id }, today))
    const [december, january] = await drafts(template.id)
    // Building A has no shares before 2026-01.
    const errors = await confirmDrafts(
      [december, january].map((d) => ({
        id: d?.id ?? '',
        amount: poisha(800000),
        isPaid: false,
        paidByOwnerId: null,
      })),
      today,
    )
    expect(errors).toEqual({ [`${december?.id}.splitRule`]: 'errors.shares.noneForPeriod' })
    expect((await drafts(template.id)).slice(0, 2).map((d) => d.status)).toEqual([
      'DRAFT',
      'CONFIRMED',
    ])
  })

  it('brings a skipped draft back', async () => {
    const { input } = await setup()
    const template = unwrap(await saveTemplate(input, today))
    const [august] = await drafts(template.id)
    unwrap(await skipDraft(august?.id ?? ''))
    await unskipDraft(august?.id ?? '')
    expect((await drafts(template.id))[0]?.status).toBe('DRAFT')
  })
})

describe('deleteTemplate', () => {
  it('deletes the template with its open drafts, and undo restores them', async () => {
    const { input } = await setup()
    const template = unwrap(await saveTemplate(input, today))
    const [august] = await drafts(template.id)
    unwrap(
      await confirmDraftAs({
        id: august?.id ?? '',
        amount: poisha(800000),
        isPaid: false,
        paidByOwnerId: null,
      }),
    )
    const deleted = unwrap(await deleteTemplate(template.id))
    expect(deleted.draftIds).toHaveLength(2)
    expect(await listDrafts()).toEqual([])
    expect(await generateDrafts(today)).toBe(0)
    await restoreTemplate(deleted)
    expect(await listDrafts()).toHaveLength(2)
    expect((await getTemplate(template.id))?.deletedAt).toBeNull()
  })
})

describe('runRollover (AGENT.md 11.1)', () => {
  it('runs at most once an hour', async () => {
    const { input } = await setup()
    unwrap(await saveTemplate({ ...input, isActive: false }, today))
    const now = Date.parse('2026-10-15T06:00:00Z')
    expect(await runRollover(now)).toBe(true)
    expect(await runRollover(now + 59 * 60 * 1000)).toBe(false)
    expect(await runRollover(now + 61 * 60 * 1000)).toBe(true)
  })

  it('removes the image data of photos deleted more than 30 days ago', async () => {
    const day = 24 * 60 * 60 * 1000
    const now = Date.parse('2026-10-15T06:00:00Z')
    const photo = (deletedAt: number | null): Attachment => ({
      ...newRecord<Attachment>({
        recordType: 'EXPENSE',
        recordId: 'e1',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        width: 1,
        height: 1,
        driveFileId: null,
        position: 0,
      }),
      deletedAt,
    })
    const photos = [photo(null), photo(now - 29 * day), photo(now - 31 * day)]
    await db.attachment.bulkAdd(photos)
    await db.attachmentBlob.bulkAdd(photos.map((p) => ({ id: p.id, blob: new Blob(['x']) })))
    expect(await cleanUpPhotoBlobs(now)).toBe(1)
    expect(await db.attachmentBlob.count()).toBe(2)
    expect(await db.attachmentBlob.get(photos[2]?.id ?? '')).toBeUndefined()
  })
})
