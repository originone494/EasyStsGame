import { encounters, prototype } from '../content/encounters';
import { enemies } from '../content/enemies';
import { getStartingDeck } from '../content/cards';
import { shuffle } from './random';
import { createDeck, createBattleCards } from './deck';
import type { BattleOptions, BattleState, CardInstance, ListenerDefinition } from './model';
import { registerListener } from './listeners';
import { startPlayerTurn } from './turn';
import { createAttributes, createWeather } from './weather';
import { createScoring } from './scoring';
import { normalRewardConfig } from '../content/economy';
import { validateRewardConfig } from './rewards';
// Compatibility exports keep the existing rule/UI/test entry points intact.
export type { BattleState as State, BattleCardState as Card, EnemyState as Enemy, BattleEvent } from './model';
type State = BattleState;
export function createBattle(encounter = 0, seed = prototype.seed,
  ownedCards: readonly CardInstance[] = createDeck(getStartingDeck(prototype.character)),
  listeners: readonly ListenerDefinition[] = [], options: BattleOptions = {}): State {
  const config = encounters[encounter] ?? encounters[0];
  const permanentDeck = ownedCards.map(card => ({ ...card }));
  const deck = shuffle(createBattleCards(permanentDeck), seed >>> 0);
  const battleEnemies = config.units.map((unit, index) => ({ ...enemies[unit.kind], ...unit, id: index + 1, maxHp: enemies[unit.kind].hp }));
  const health = options.player ?? { hp: prototype.maxHp, maxHp: prototype.maxHp };
  if (!Number.isSafeInteger(health.hp) || !Number.isSafeInteger(health.maxHp) || health.hp <= 0 || health.hp > health.maxHp) throw new Error('开战生命配置无效。');
  const gold = options.gold ?? 0;
  if (!Number.isSafeInteger(gold) || gold < 0) throw new Error('开战金币配置无效。');
  const s: State = { encounter, seed: seed >>> 0, rng: deck.seed, turn: 1, size: prototype.size, handSize: prototype.handSize,
    party: [{ id: 0, key: prototype.character }], deck: permanentDeck,
    weather: createWeather(seed, encounter, options.initialWeather), attributes: createAttributes(options.attributes),
    player: { position: config.player, ...health },
    enemies: battleEnemies, scoring: createScoring(battleEnemies),
    gold, rewardConfig: validateRewardConfig(options.rewardConfig ?? normalRewardConfig(config.rewardAttribute ?? 'sunAdaptation')), reward: null,
    hand: [], draw: deck.values, discard: [], exhaust: [], executing: [],
    lastKillPending: false, finishReason: null, eventQueue: [], eventHistory: [], eventTrace: [],
    eventContext: null, nextEventId: 1, processingEvents: false, listeners: [], nextListenerId: 1, nextListenerOrder: 1,
    damageModifiers: [], nextDamageBatchId: 1,
    pushHistory: [], nextPushBatchId: 1,
    status: 'playing', phase: 'player', log: [`战斗开始。回合 1，补牌至 ${prototype.handSize} 张。`], events: [], notice: '', scenario: '' };
  for (const listener of listeners) registerListener(s, listener);
  startPlayerTurn(s);
  return s;
}
