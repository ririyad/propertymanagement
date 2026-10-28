import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, Outlet } from 'react-router'
import { isSetupComplete } from '@/services/setup'

/** Sends a fresh install to the setup wizard before any other screen. */
export function SetupGate() {
  const complete = useLiveQuery(isSetupComplete, [])
  if (complete === undefined) return null
  return complete ? <Outlet /> : <Navigate to="/setup" replace />
}
