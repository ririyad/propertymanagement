import { createBrowserRouter, RouterProvider } from 'react-router'
import { BuildingDetailPage } from '@/features/buildings/BuildingDetailPage'
import { BuildingEditPage } from '@/features/buildings/BuildingEditPage'
import { BuildingsPage } from '@/features/buildings/BuildingsPage'
import { CategoriesPage } from '@/features/categories/CategoriesPage'
import { CategoryEditPage } from '@/features/categories/CategoryEditPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ExpenseEditPage } from '@/features/expenses/ExpenseEditPage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { MeterDetailPage } from '@/features/meters/MeterDetailPage'
import { MeterEditPage } from '@/features/meters/MeterEditPage'
import { MetersPage } from '@/features/meters/MetersPage'
import { TariffEditPage } from '@/features/meters/TariffEditPage'
import { MorePage } from '@/features/more/MorePage'
import { OwnerDetailPage } from '@/features/owners/OwnerDetailPage'
import { OwnerEditPage } from '@/features/owners/OwnerEditPage'
import { OwnersPage } from '@/features/owners/OwnersPage'
import { RentPage } from '@/features/rent/RentPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SetupPage } from '@/features/setup/SetupPage'
import { SharesPage } from '@/features/shares/SharesPage'
import { ShareSetEditPage } from '@/features/shares/ShareSetEditPage'
import { Toaster } from '@/ui/Toaster'
import { AppLayout } from './AppLayout'
import { NotFoundPage } from './NotFoundPage'
import { SetupGate } from './SetupGate'

const router = createBrowserRouter([
  { path: '/setup', element: <SetupPage /> },
  {
    element: <AppLayout />,
    children: [
      {
        element: <SetupGate />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'expenses/new', element: <ExpenseEditPage /> },
          { path: 'expenses/:id/edit', element: <ExpenseEditPage /> },
          { path: 'rent', element: <RentPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'more', element: <MorePage /> },
          { path: 'owners', element: <OwnersPage /> },
          { path: 'owners/new', element: <OwnerEditPage /> },
          { path: 'owners/:id', element: <OwnerDetailPage /> },
          { path: 'owners/:id/edit', element: <OwnerEditPage /> },
          { path: 'buildings', element: <BuildingsPage /> },
          { path: 'buildings/new', element: <BuildingEditPage /> },
          { path: 'buildings/:id', element: <BuildingDetailPage /> },
          { path: 'buildings/:id/edit', element: <BuildingEditPage /> },
          { path: 'buildings/:id/shares', element: <SharesPage /> },
          { path: 'buildings/:id/shares/new', element: <ShareSetEditPage /> },
          { path: 'buildings/:id/shares/:shareSetId/edit', element: <ShareSetEditPage /> },
          { path: 'buildings/:id/meters', element: <MetersPage /> },
          { path: 'buildings/:id/meters/new', element: <MeterEditPage /> },
          { path: 'meters/:meterId', element: <MeterDetailPage /> },
          { path: 'meters/:meterId/edit', element: <MeterEditPage /> },
          { path: 'meters/:meterId/tariffs/new', element: <TariffEditPage /> },
          { path: 'meters/:meterId/tariffs/:tariffId/edit', element: <TariffEditPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'categories/new', element: <CategoryEditPage /> },
          { path: 'categories/:id/edit', element: <CategoryEditPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

export function App() {
  return (
    <Toaster>
      <RouterProvider router={router} />
    </Toaster>
  )
}
