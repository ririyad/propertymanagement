import { createBrowserRouter, RouterProvider } from 'react-router'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { MorePage } from '@/features/more/MorePage'
import { RentPage } from '@/features/rent/RentPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SetupPage } from '@/features/setup/SetupPage'
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
          { path: 'rent', element: <RentPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'more', element: <MorePage /> },
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
