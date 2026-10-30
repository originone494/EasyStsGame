// Shared data contracts. This module has no runtime dependencies on content or UI.
export type InstanceId = number;
export type WeatherKind = 'sun' | 'rain' | 'wind';
export interface AdaptationAttributes { sunAdaptation: number; rainAdaptation: number; windAdaptation: number }
export interface WeatherState {
  initial: WeatherKind; current: WeatherKind; cycle: WeatherKind[]; turnsPerWeather: number;
  rng: number; lastUpdatedTurn: number;
}
export interface BattleOptions {
  initialWeather?: WeatherKind; attributes?: Partial<AdaptationAttributes>;
  gold?: number; player?: { hp: number; maxHp: number }; rewardConfig?: RewardConfig;
}
export type DamageKind = 'card' | 'relic' | 'indirect' | 'contact';
export type UnitRef = { kind: 'player'; id: 0 } | { kind: 'enemy'; id: number };
export interface DamageTerm { value: number; coefficient: number }
export interface DamageModifiers { flat?: number[]; multipliers?: number[]; percentBonuses?: number[] }
export interface DamageOptions extends DamageModifiers { kind?: DamageKind; baseTerms?: DamageTerm[] }
export interface DamageModifier extends DamageModifiers { id: string; kind?: DamageKind; target?: UnitRef }
export interface DamageRequest extends DamageModifiers { target: UnitRef; base: number; kind: DamageKind; baseTerms?: DamageTerm[] }
export interface DamageResult {
  batchId: number; kind: DamageKind; target: UnitRef; base: number; flat: number[]; multipliers: number[];
  baseTerms: DamageTerm[];
  percentBonuses: number[];
  resolved: number; hpLost: number; hpBefore: number; hpAfter: number;
}
export type PushDirection = 'away' | 'toward' | 'left' | 'right';
export type PushCollisionMode = 'transfer' | 'opposed' | 'converge';
export interface PushRequest { id: number; amount: number; direction: -1 | 1 }
export interface PushEventDetail {
  batchId: number; tick: number; position: number; mode: PushCollisionMode | 'move';
  direction?: -1 | 1; from?: number; to?: number; leftAmount?: number; rightAmount?: number; canceled?: number;
}
export interface PushAccounting { initial: number; moved: number; canceled: number; boundaryLost: number; playerBlocked: number; remaining: number }
export interface PushBatchResult extends PushAccounting {
  batchId: number; ticks: number; requests: PushRequest[]; units: { id: number; from: number; to: number }[];
}
export type Effect =
  | ({ type: 'damage' | 'damageAll'; amount: number; hits?: number } & DamageModifiers)
  | { type: 'draw' | 'heal' | 'move' | 'loseHp'; amount: number }
  | { type: 'push' | 'pushAll'; amount: number; direction?: PushDirection }
  | { type: 'pushGroup'; pushes: PushRequest[] }
  | { type: 'listen'; listener: ListenerDefinition };

export interface CardDefinition {
  name: string;
  kind: string;
  description: string;
  keywords?: string[];
  art?: string;
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
export interface EnemyScoreRecord {
  id: number; maxHp: number; hpLost: number; disposition: 'active' | 'killed' | 'contact';
}
export interface ScoreSummary { hpLost: number; maxHp: number; ratio: number; percent: number }
export interface CardRewardEntitlement { choices: number; picks: number; canSkip: boolean }
export interface RewardConfig {
  floor: number; attributeCap: number; baseGold: number; baseAttributes: AdaptationAttributes;
  cardOffer: CardRewardEntitlement | null;
}
export interface RewardOutcome {
  eligible: boolean; score: ScoreSummary; rewardRatio: number; gold: number;
  scaledAttributes: AdaptationAttributes; gainedAttributes: AdaptationAttributes; overflowAttributes: AdaptationAttributes;
  attributesAfter: AdaptationAttributes; cardOffer: CardRewardEntitlement | null;
}
export interface EncounterDefinition {
  id: string; name: string; description: string; player: number;
  rewardAttribute?: keyof AdaptationAttributes;
  units: { kind: string; position: number }[];
}
export interface BattleConfig { size: number; maxHp: number; handSize: number; seed: number; character: string }

// Compatibility facts used by the existing floating combat feedback.
export interface BattleEvent {
  type: 'collision' | 'damage' | 'death' | 'move' | 'draw' | 'heal';
  actor?: InstanceId; target?: InstanceId; amount?: number;
}
export type EventType = 'CARD_PLAYED' | 'DAMAGE_RESOLVED' | 'HP_LOST' | 'ENEMY_DIED'
  | 'ENEMY_CONTACT' | 'COLLISION' | 'UNIT_MOVED' | 'CARD_DRAWN' | 'CARD_EXHAUSTED'
  | 'TURN_STARTED' | 'HEALED' | 'WEATHER_CHANGED';
export type EntityRef = { kind: 'player'; id: 0 } | { kind: 'enemy'; id: number }
  | { kind: 'card' | 'relic' | 'temporary'; id: number; key: string }
  | { kind: 'system'; id: string };
export interface EventContext { source: EntityRef; parentId: number | null; allowChain: boolean }
export interface GameEvent extends EventContext {
  id: number; sequence: number; type: EventType; target: EntityRef | null; value: number; actor: EntityRef | null;
  batchId?: number; damage?: DamageResult; hpLossCause?: 'damage' | 'direct';
  push?: PushEventDetail;
  weatherChange?: { from: WeatherKind; to: WeatherKind; turn: number };
}
export interface EventTrace {
  kind: 'enqueue' | 'dequeue' | 'snapshot' | 'trigger' | 'skip' | 'cancel' | 'finish';
  eventId?: number; listenerId?: number; message: string; values?: number[];
}
export type TriggerCondition = { type: 'always' }
  | { type: 'missingHpAtLeast' | 'eventValueAtLeast'; value: number }
  | { type: 'sourceKind'; kind: EntityRef['kind'] }
  | { type: 'targetKind'; kind: EntityRef['kind'] }
  | { type: 'damageKind'; kind: DamageKind }
  | { type: 'hpLossCause'; cause: 'damage' | 'direct' }
  | { type: 'collisionMode'; mode: PushCollisionMode }
  | { type: 'weather'; weather: WeatherKind }
  | { type: 'all'; conditions: TriggerCondition[] };
// Non-target terms are frozen at dequeue. Target terms are read on execution.
export type TriggerAmount = number | { base?: number; missingHp?: number; eventValue?: number; targetHp?: number; multiplier?: number };
export type TriggerTarget = 'eventTarget' | 'nearest' | 'lowestHp' | 'random';
export type TriggerEffect = { type: 'heal' | 'draw' | 'loseHp'; amount: TriggerAmount }
  | ({ type: 'damage'; amount: TriggerAmount; target: TriggerTarget } & DamageModifiers)
  | ({ type: 'damageAll'; amount: TriggerAmount } & DamageModifiers)
  | { type: 'push'; amount: TriggerAmount; target: TriggerTarget; direction?: PushDirection }
  | { type: 'pushAll'; amount: TriggerAmount; direction?: PushDirection }
  | { type: 'pushGroup'; pushes: PushRequest[] }
  | { type: 'setListenerActive'; listenerId: number | 'self'; active: boolean }
  | { type: 'listen'; listener: ListenerDefinition };
export type TriggerLimit = { scope: 'unlimited' } | { scope: 'turn' | 'battle'; count: number };
interface ListenerBase {
  key: string; name: string; listensTo: EventType[]; condition?: TriggerCondition;
  effects: TriggerEffect[]; limit: TriggerLimit; allowChain: boolean; duration?: 'turn' | 'battle';
}
export type ListenerDefinition = ListenerBase & ({ kind: 'relic' }
  | { kind: 'temporary'; snapshot: 'eventStart' | 'execution' });
export interface ListenerState {
  id: number; order: number; definition: ListenerDefinition; active: boolean;
  registeredTurn: number; totalTriggers: number; turnTriggers: number; lastTriggerTurn: number;
}
export type FinishReason = 'player-death' | 'last-contact' | 'last-kill' | 'boss-contact';
export interface BattleState {
  encounter: number; seed: number; rng: number; turn: number; size: number; handSize: number;
  party: CharacterInstance[];
  weather: WeatherState; attributes: AdaptationAttributes;
  deck: CardInstance[];
  player: PlayerState;
  enemies: EnemyState[];
  scoring: EnemyScoreRecord[];
  gold: number; rewardConfig: RewardConfig; reward: RewardOutcome | null;
  hand: BattleCardState[]; draw: BattleCardState[]; discard: BattleCardState[];
  exhaust: BattleCardState[]; executing: BattleCardState[];
  status: 'playing' | 'won' | 'lost'; phase: 'player' | 'enemy' | 'card' | 'events' | 'closing' | 'finished';
  lastKillPending: boolean; finishReason: FinishReason | null;
  eventQueue: GameEvent[]; eventHistory: GameEvent[]; eventTrace: EventTrace[];
  eventContext: EventContext | null; nextEventId: number; processingEvents: boolean;
  damageModifiers: DamageModifier[]; nextDamageBatchId: number;
  pushHistory: PushBatchResult[]; nextPushBatchId: number;
  listeners: ListenerState[]; nextListenerId: number; nextListenerOrder: number;
  log: string[]; events: BattleEvent[]; notice: string; scenario: string;
}
