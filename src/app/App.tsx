import { createBrowserRouter, RouterProvider } from 'react-router'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { MorePage } from '@/features/more/MorePage'
import { RentPage } from '@/features/rent/RentPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { AppLayout } from './AppLayout'
import { NotFoundPage } from './NotFoundPage'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'expenses', element: <ExpensesPage /> },
      { path: 'rent', element: <RentPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
