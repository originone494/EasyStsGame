import { createBattle, type State } from './state';
import { prototype } from '../content/encounters';
import { createDeck } from './deck';
export const scenarios = [ { id: 'heal', name: '最后击杀后治疗' }, { id: 'empty', name: '空牌堆与执行区' }, { id: 'lethal', name: '接触致死' }, { id: 'chain', name: '击退传递' } ];
export function createScenario(id: string, seed = prototype.seed): State {
  const s = createBattle(0, seed); s.scenario = id; s.log = ['开发局面：固定手牌，仅用于规则验收。'];
  if (id === 'heal') { s.player.hp = 7; s.enemies = [{ ...s.enemies[0], hp: 2 }]; s.hand = [{ id: 0, key: 'debugHeal' }]; s.draw = []; s.discard = []; }
  if (id === 'empty') { const all = [...s.hand,...s.draw]; s.hand = all.filter(c => c.key === 'prepare'); s.discard = all.filter(c => c.key !== 'prepare'); s.draw = []; }
  if (id === 'lethal') { s.player.hp = 3; s.enemies = [{ ...s.enemies[0], position: 7 }]; }
  if (id === 'chain') { const all = [...s.hand,...s.draw]; s.hand = all.filter(c => c.key === 'push'); s.draw = all.filter(c => c.key !== 'push'); s.enemies[0].position = 8; s.enemies[1].position = 9; }
  // Fixtures have deliberate custom decks; keep their permanent registry in sync.
  s.deck = [...s.hand, ...s.draw, ...s.discard, ...s.exhaust, ...s.executing]
    .map(card => createDeck([card.key], card.id)[0]);
  return s;
}
