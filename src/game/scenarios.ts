import { createBattle, type State } from './state';
import { prototype } from '../content/encounters';
import { createDeck } from './deck';
import { registerListener } from './listeners';
import { testRelics } from '../content/relics';
export const scenarios = [ { id: 'heal', name: '最后击杀后治疗' }, { id: 'empty', name: '空牌堆与执行区' }, { id: 'lethal', name: '接触致死' }, { id: 'chain', name: '击退传递' },
  { id: 'events', name: '最后击杀遗物连锁' }, { id: 'snapshots', name: '遗物数值快照' }, { id: 'eventLethal', name: '生命代价立即失败' }, { id: 'eventTarget', name: '目标失效保留治疗' } ];
export function createScenario(id: string, seed = prototype.seed): State {
  const s = createBattle(0, seed); s.scenario = id; s.log = ['开发局面：固定手牌，仅用于规则验收。'];
  if (id === 'heal') { s.player.hp = 7; s.enemies = [{ ...s.enemies[0], hp: 2 }]; s.hand = [{ id: 0, key: 'debugHeal' }]; s.draw = []; s.discard = []; }
  if (id === 'empty') { const all = [...s.hand,...s.draw]; s.hand = all.filter(c => c.key === 'prepare'); s.discard = all.filter(c => c.key !== 'prepare'); s.draw = []; }
  if (id === 'lethal') { s.player.hp = 3; s.enemies = [{ ...s.enemies[0], position: 7 }]; }
  if (id === 'chain') { const all = [...s.hand,...s.draw]; s.hand = all.filter(c => c.key === 'push'); s.draw = all.filter(c => c.key !== 'push'); s.enemies[0].position = 8; s.enemies[1].position = 9; }
  if (id === 'events') {
    s.player.hp = 7; s.enemies = [{ ...s.enemies[0], hp: 2 }];
    s.hand = [{ id: 0, key: 'debugHeal' }]; s.draw = []; s.discard = [];
    registerListener(s, testRelics.lastHeal); registerListener(s, testRelics.echo);
  }
  if (id === 'snapshots') {
    s.player.hp = 5; s.enemies = [{ ...s.enemies[1], hp: 30, maxHp: 30 }];
    s.hand = [{ id: 0, key: 'debugZero' }]; s.draw = []; s.discard = [];
    registerListener(s, testRelics.firstHeal); registerListener(s, testRelics.missingHp);
  }
  if (id === 'eventLethal') {
    s.player.hp = 3; s.hand = [{ id: 0, key: 'debugCost' }]; s.draw = []; s.discard = [];
    registerListener(s, testRelics.rescue);
  }
  if (id === 'eventTarget') {
    s.player.hp = 7; s.enemies = [{ ...s.enemies[0], hp: 2 }];
    s.hand = [{ id: 0, key: 'debugZero' }]; s.draw = []; s.discard = [];
    registerListener(s, { key: 'test_first_kill', name: '先行击杀（测试）', kind: 'relic', listensTo: ['CARD_PLAYED'],
      effects: [{ type: 'damage', target: 'eventTarget', amount: 10 }], limit: { scope: 'unlimited' }, allowChain: true });
    registerListener(s, { key: 'test_independent', name: '独立治疗（测试）', kind: 'relic', listensTo: ['CARD_PLAYED'],
      effects: [{ type: 'damage', target: 'eventTarget', amount: 10 }, { type: 'heal', amount: 2 }], limit: { scope: 'unlimited' }, allowChain: false });
  }
  // Fixtures have deliberate custom decks; keep their permanent registry in sync.
  s.deck = [...s.hand, ...s.draw, ...s.discard, ...s.exhaust, ...s.executing]
    .map(card => createDeck([card.key], card.id)[0]);
  // A fixture starts at its preset state; omit the discarded normal opening.
  s.events = []; s.eventHistory = []; s.eventTrace = []; s.nextEventId = 1;
  return s;
}
