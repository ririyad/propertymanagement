import { useLiveQuery } from 'dexie-react-hooks'
import { listBuildings } from '@/data/repositories/buildings'
import { listCategories } from '@/data/repositories/categories'
import { listOwners } from '@/data/repositories/owners'

// Live lists shared by many screens; each is undefined until loaded, then updates after writes.

export function useOwners() {
  return useLiveQuery(listOwners, [])
}

export function useBuildings() {
  return useLiveQuery(listBuildings, [])
}

export function useCategories() {
  return useLiveQuery(listCategories, [])
}
