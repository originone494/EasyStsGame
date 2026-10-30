import { encounters, prototype } from '../content/encounters';
import { enemies } from '../content/enemies';
import { getStartingDeck } from '../content/cards';
import { shuffle } from './random';
import { createDeck, createBattleCards } from './deck';
import type { BattleState, CardInstance } from './model';
// Compatibility exports keep the existing rule/UI/test entry points intact.
export type { BattleState as State, BattleCardState as Card, EnemyState as Enemy, BattleEvent } from './model';
type State = BattleState;
export function createBattle(encounter = 0, seed = prototype.seed,
  ownedCards: readonly CardInstance[] = createDeck(getStartingDeck(prototype.character))): State {
  const config = encounters[encounter] ?? encounters[0];
  const permanentDeck = ownedCards.map(card => ({ ...card }));
  const deck = shuffle(createBattleCards(permanentDeck), seed >>> 0);
  return { encounter, seed: seed >>> 0, rng: deck.seed, turn: 1, size: prototype.size, handSize: prototype.handSize,
    party: [{ id: 0, key: prototype.character }], deck: permanentDeck,
    player: { position: config.player, hp: prototype.maxHp, maxHp: prototype.maxHp },
    enemies: config.units.map((unit, index) => ({ ...enemies[unit.kind], ...unit, id: index + 1, maxHp: enemies[unit.kind].hp })),
    hand: deck.values.slice(0, prototype.handSize), draw: deck.values.slice(prototype.handSize), discard: [], exhaust: [], executing: [],
    status: 'playing', phase: 'player', log: [`战斗开始。回合 1，补牌至 ${prototype.handSize} 张。`], events: [], notice: '', scenario: '' };
}
