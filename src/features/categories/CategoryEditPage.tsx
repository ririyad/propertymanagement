import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { isLive } from '@/data/records'
import { getCategory } from '@/data/repositories/categories'
import type { CategoryKind, ExpenseCategory, SplitRule } from '@/domain/types'
import {
  CATEGORY_KINDS,
  CATEGORY_SPLIT_RULES,
  deleteCategory,
  restoreCategory,
  saveCategory,
} from '@/services/categories'
import { Button } from '@/ui/components/button'
import { Input, Select } from '@/ui/components/input'
import { CheckboxField, ErrorText, Field } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

export function CategoryEditPage() {
  const { id } = useParams()
  const loaded = useLiveQuery(
    async () => ({ category: id ? await getCategory(id) : undefined }),
    [id],
  )
  if (!loaded || (id && !(loaded.category && isLive(loaded.category)))) return null
  return <CategoryForm key={loaded.category?.id ?? 'new'} category={loaded.category} />
}

interface FormValues {
  name: string
  kind: CategoryKind
  defaultSplitRule: SplitRule
  isHidden: boolean
}

function CategoryForm({ category }: { category: ExpenseCategory | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      name: category?.name ?? '',
      kind: category?.kind ?? 'ONE_OFF',
      defaultSplitRule: category?.defaultSplitRule ?? 'BY_SHARE',
      isHidden: category?.isHidden ?? false,
    },
  })
  const kindLocked = category?.isSystem === true

  const onSubmit = handleSubmit(async (values) => {
    // A disabled select submits no value; the service keeps a system category's kind anyway.
    const kind = category && kindLocked ? category.kind : values.kind
    const result = await saveCategory({ id: category?.id, ...values, kind })
    if (!result.ok) return setErrors(result.errors)
    void navigate('/categories', { replace: true })
  })

  const onDelete = async () => {
    if (!category) return
    const result = await deleteCategory(category.id)
    if (!result.ok) return setErrors(result.errors)
    void navigate('/categories', { replace: true })
    toast({
      message: t('categories.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreCategory(category.id) },
    })
  }

  return (
    <>
      <PageHeader
        title={category ? t('categories.editTitle') : t('categories.new')}
        back="/categories"
      />
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <Field label={t('category.name')} error={errors.name}>
          <Input {...register('name')} aria-invalid={!!errors.name} />
        </Field>
        <Field
          label={t('category.kind')}
          error={errors.kind}
          hint={kindLocked ? t('category.kindLocked') : undefined}
        >
          <Select {...register('kind')} disabled={kindLocked} aria-invalid={!!errors.kind}>
            {CATEGORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`category.kinds.${kind}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('category.defaultSplitRule')}
          error={errors.defaultSplitRule}
          hint={t('category.defaultSplitRuleHint')}
        >
          <Select {...register('defaultSplitRule')} aria-invalid={!!errors.defaultSplitRule}>
            {CATEGORY_SPLIT_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {t(`splitRule.${rule}`)}
              </option>
            ))}
          </Select>
        </Field>
        <CheckboxField label={t('category.isHidden')} {...register('isHidden')} />
        <Button type="submit" disabled={formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
      {category && !category.isSystem && (
        <div className="mt-6">
          <Button variant="outline" onClick={() => void onDelete()}>
            <Trash2 aria-hidden />
            {t('common.delete')}
          </Button>
          <ErrorText error={errors.category} />
        </div>
      )}
    </>
  )
}
