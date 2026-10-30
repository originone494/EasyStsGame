// Shared data contracts. This module has no runtime dependencies on content or UI.
export type InstanceId = number;
export type Effect =
  | { type: 'damage'; amount: number; hits?: number }
  | { type: 'draw' | 'heal' | 'push' | 'move'; amount: number };

export interface CardDefinition {
  name: string;
  kind: string;
  description: string;
  target: 'enemy' | 'direction' | 'none';
  effects: Effect[];
  exhaust?: boolean;
}

// Permanent ownership. Duplicate names have distinct IDs and upgrade flags.
export interface CardInstance { id: InstanceId; key: string; upgraded: boolean }
// Battle-only reference. Location is the containing pile, never a second field.
// `key` is retained for the existing UI and fixed test fixtures.
export interface BattleCardState { id: InstanceId; key: string; temporary?: Record<string, number> }
export type CardZone = 'hand' | 'draw' | 'discard' | 'exhaust' | 'executing';

export interface CharacterDefinition { name: string; startingCards: string[] }
// Characters share player health and position; no per-character health/position.
export interface CharacterInstance { id: InstanceId; key: string }
export interface PlayerState { position: number; hp: number; maxHp: number }
export interface EnemyDefinition { name: string; hp: number; speed: number; damage: number; glyph: string }
export interface EnemyState {
  id: InstanceId; kind: string; position: number;
  hp: number; maxHp: number; speed: number; damage: number;
}
export interface EncounterDefinition {
  id: string; name: string; description: string; player: number;
  units: { kind: string; position: number }[];
}
export interface BattleConfig { size: number; maxHp: number; handSize: number; seed: number; character: string }

// Fact log only. FIFO dispatch and listener snapshots belong to step 2.
export interface BattleEvent {
  type: 'collision' | 'damage' | 'death' | 'move' | 'draw' | 'heal';
  actor?: InstanceId; target?: InstanceId; amount?: number;
}
export interface BattleState {
  encounter: number; seed: number; rng: number; turn: number; size: number; handSize: number;
  party: CharacterInstance[];
  deck: CardInstance[];
  player: PlayerState;
  enemies: EnemyState[];
  hand: BattleCardState[]; draw: BattleCardState[]; discard: BattleCardState[];
  exhaust: BattleCardState[]; executing: BattleCardState[];
  status: 'playing' | 'won' | 'lost'; phase: 'player' | 'enemy';
  log: string[]; events: BattleEvent[]; notice: string; scenario: string;
}
