export type CombatStatus = 'active' | 'victory' | 'defeat';
export type ParticipantType = 'hero' | 'enemy';

export interface CombatParticipantDTO {
  id: string;
  type: ParticipantType;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  isAlive: boolean;
  heroId?: string;
}

export interface CombatDTO {
  id: string;
  status: CombatStatus;
  turn: number;
  /** Participant whose turn it is */
  activeParticipantId: string;
  participants: CombatParticipantDTO[];
  log: CombatLogEntry[];
}

export interface CombatLogEntry {
  turn: number;
  actorId: string;
  actorName: string;
  action: string;
  targetId?: string;
  targetName?: string;
  damage?: number;
  heal?: number;
  message: string;
}

export type CombatActionType = 'attack' | 'ability' | 'defend';

export interface CombatActionRequest {
  combatId: string;
  action: CombatActionType;
  targetId?: string;
}

export interface CombatActionResult {
  combat: CombatDTO;
  log: CombatLogEntry[];
}
