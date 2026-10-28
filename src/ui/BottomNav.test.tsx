import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { BottomNav } from '@/ui/BottomNav'

describe('BottomNav', () => {
  it('shows the five tabs and marks the current one', () => {
    render(
      <MemoryRouter initialEntries={['/expenses']}>
        <BottomNav />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Dashboard',
      'Expenses',
      'Rent',
      'Reports',
      'More',
    ])
    expect(within(nav).getByRole('link', { name: 'Expenses' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe(
      null,
    )
  })
})
