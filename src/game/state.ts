import { encounters, prototype } from '../content/encounters';
import { enemies, type EnemyKind } from '../content/enemies';
import { startingDeck } from '../content/cards';
import { shuffle } from './random';
export interface Card { id: number; key: string }
export interface Enemy { id: number; kind: EnemyKind; position: number; hp: number; maxHp: number; speed: number; damage: number }
export interface BattleEvent { type: 'collision' | 'damage' | 'death' | 'move' | 'draw' | 'heal'; actor?: number; target?: number; amount?: number }
export interface State {
  encounter: number; seed: number; rng: number; turn: number; size: number;
  player: { position: number; hp: number; maxHp: number }; enemies: Enemy[];
  hand: Card[]; draw: Card[]; discard: Card[]; exhaust: Card[]; executing: Card[];
  status: 'playing' | 'won' | 'lost'; phase: 'player' | 'enemy'; log: string[]; events: BattleEvent[]; notice: string; scenario: string;
}
export function createBattle(encounter = 0, seed = prototype.seed): State {
  const config = encounters[encounter] ?? encounters[0];
  const deck = shuffle(startingDeck.map((key, id) => ({ key, id })), seed >>> 0);
  return { encounter, seed: seed >>> 0, rng: deck.seed, turn: 1, size: prototype.size,
    player: { position: config.player, hp: prototype.maxHp, maxHp: prototype.maxHp },
    enemies: config.units.map((unit, index) => ({ ...enemies[unit.kind], ...unit, id: index + 1, maxHp: enemies[unit.kind].hp })),
    hand: deck.values.slice(0, prototype.handSize), draw: deck.values.slice(prototype.handSize), discard: [], exhaust: [], executing: [],
    status: 'playing', phase: 'player', log: ['战斗开始。回合 1，补牌至 3 张。'], events: [], notice: '', scenario: '' };
}
