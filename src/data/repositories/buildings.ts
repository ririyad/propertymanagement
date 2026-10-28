import { db } from '@/data/db'
import { isLive, sameName } from '@/data/records'
import type { Building, BuildingGroup } from '@/domain/types'

export async function listBuildings(): Promise<Building[]> {
  return (await db.building.orderBy('sortOrder').toArray()).filter(isLive)
}

export async function getBuilding(id: string): Promise<Building | undefined> {
  return db.building.get(id)
}

export async function listBuildingGroups(): Promise<BuildingGroup[]> {
  return (await db.buildingGroup.toArray())
    .filter(isLive)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function findBuildingGroup(name: string): Promise<BuildingGroup | undefined> {
  return (await listBuildingGroups()).find((g) => sameName(g.name, name))
}

export async function nextBuildingSortOrder(): Promise<number> {
  const last = await db.building.orderBy('sortOrder').last()
  return last ? last.sortOrder + 1 : 0
}
