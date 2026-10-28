import { useState } from 'react'
import type { Errors } from '@/domain/result'

/** Field errors returned by a service, as i18n keys keyed by field name. */
export function useServiceErrors() {
  const [errors, setErrors] = useState<Errors>({})
  return { errors, setErrors, clearErrors: () => setErrors({}) }
}
