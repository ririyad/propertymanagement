/**
 * Asks the browser not to evict the app's data under storage pressure (AGENT.md D26, 12.7).
 * Runs on every start until granted; installed PWAs are normally granted it.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!('storage' in navigator)) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
