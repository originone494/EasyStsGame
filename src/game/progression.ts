import { createBattle, type State } from './state';
import { encounters } from '../content/encounters';
import { nextRandom } from './random';

// Temporary three-encounter progression for reviewing earned growth. The actual
// three-floor map and RunState remain step 8; restart/switch stay independent.
export function continueBattle(previous: State): State {
  if (previous.scenario || previous.status !== 'won' || !previous.reward?.eligible) throw new Error('当前战斗不能继续。');
  const relics = previous.listeners.filter(listener => listener.active && listener.definition.kind === 'relic')
    .sort((a, b) => a.order - b.order).map(listener => listener.definition);
  return createBattle((previous.encounter + 1) % encounters.length, nextRandom(previous.seed), previous.deck, relics, {
    gold: previous.gold, attributes: previous.attributes, player: { hp: previous.player.hp, maxHp: previous.player.maxHp },
  });
}
