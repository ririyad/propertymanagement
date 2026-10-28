import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { ExpenseCategory } from '@/domain/types'
import { useCategories } from '@/features/shared/useLookups'
import { moveCategory } from '@/services/categories'
import { Button } from '@/ui/components/button'
import { primaryLinkClass } from '@/ui/linkStyles'
import { List } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'

/** Rename, add, hide and reorder expense categories (AGENT.md section 9, P1-T04). */
export function CategoriesPage() {
  const { t } = useTranslation()
  const categories = useCategories()
  if (!categories) return null

  return (
    <>
      <PageHeader
        title={t('categories.title')}
        back="/more"
        actions={
          <Link to="/categories/new" className={primaryLinkClass}>
            <Plus aria-hidden />
            {t('categories.add')}
          </Link>
        }
      />
      <List>
        {categories.map((category, i) => (
          <CategoryRow
            key={category.id}
            category={category}
            isFirst={i === 0}
            isLast={i === categories.length - 1}
          />
        ))}
      </List>
    </>
  )
}

function CategoryRow({
  category,
  isFirst,
  isLast,
}: {
  category: ExpenseCategory
  isFirst: boolean
  isLast: boolean
}) {
  const { t } = useTranslation()
  const detail = [
    t(`category.kinds.${category.kind}`),
    t(`splitRule.${category.defaultSplitRule}`),
    category.isSystem && t('categories.builtIn'),
    category.isHidden && t('categories.hidden'),
  ].filter(Boolean)

  return (
    <li className="flex items-center">
      <Link
        to={`/categories/${category.id}/edit`}
        className="min-h-14 min-w-0 flex-1 px-4 py-3 hover:bg-accent"
      >
        <span
          className={
            category.isHidden
              ? 'block truncate text-muted-foreground'
              : 'block truncate font-medium'
          }
        >
          {category.name}
        </span>
        <span className="block truncate text-sm text-muted-foreground">{detail.join(' · ')}</span>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        disabled={isFirst}
        aria-label={t('categories.moveUp', { name: category.name })}
        onClick={() => void moveCategory(category.id, -1)}
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={isLast}
        aria-label={t('categories.moveDown', { name: category.name })}
        onClick={() => void moveCategory(category.id, 1)}
      >
        <ArrowDown aria-hidden />
      </Button>
    </li>
  )
}
