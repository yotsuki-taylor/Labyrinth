export type ResourceType = 'gold' | 'stone' | 'iron' | 'essence' | 'relics';

export const RESOURCE_TYPES: ResourceType[] = ['gold', 'stone', 'iron', 'essence', 'relics'];

export interface ResourceMap {
  gold: number;
  stone: number;
  iron: number;
  essence: number;
  relics: number;
}

export const EMPTY_RESOURCES: ResourceMap = {
  gold: 0,
  stone: 0,
  iron: 0,
  essence: 0,
  relics: 0,
};

export function canAfford(balance: ResourceMap, cost: Partial<ResourceMap>): boolean {
  for (const key of Object.keys(cost) as ResourceType[]) {
    if ((balance[key] ?? 0) < (cost[key] ?? 0)) return false;
  }
  return true;
}

export function subtractCost(balance: ResourceMap, cost: Partial<ResourceMap>): ResourceMap {
  const result = { ...balance };
  for (const key of Object.keys(cost) as ResourceType[]) {
    result[key] = (result[key] ?? 0) - (cost[key] ?? 0);
  }
  return result;
}
