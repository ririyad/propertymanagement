import { getMeta, setMeta } from '@/data/repositories/appMeta'

export async function isSetupComplete(): Promise<boolean> {
  return (await getMeta<number>('setupCompletedAt')) !== undefined
}

/** Ends the setup wizard. Skipped steps can be finished later from More (AGENT.md section 9). */
export async function completeSetup(): Promise<void> {
  if (!(await isSetupComplete())) await setMeta('setupCompletedAt', Date.now())
}
