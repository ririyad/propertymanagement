import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/** Translates a key known only at runtime, such as an error key returned by a service. */
export function useTranslateKey(): (key: string, params?: Record<string, unknown>) => string {
  const { t } = useTranslation()
  return useCallback(
    (key, params) =>
      (t as unknown as (k: string, p?: Record<string, unknown>) => string)(key, params),
    [t],
  )
}
