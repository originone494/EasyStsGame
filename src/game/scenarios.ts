import { createBattle, type State } from './state';
import { prototype } from '../content/encounters';
import { createDeck } from './deck';
import { registerListener } from './listeners';
import { testRelics } from '../content/relics';
import { pushFixtures } from '../content/pushScenarios';
import { enemies } from '../content/enemies';
import { weatherFixtures } from '../content/weatherScenarios';
import { createScoring } from './scoring';
import { rewardFixtures } from '../content/rewardScenarios';
export const scenarios = [ { id: 'heal', name: '最后击杀后治疗' }, { id: 'empty', name: '空牌堆与执行区' }, { id: 'lethal', name: '接触致死' }, { id: 'chain', name: '击退传递' },
  { id: 'events', name: '最后击杀遗物连锁' }, { id: 'snapshots', name: '遗物数值快照' }, { id: 'eventLethal', name: '生命代价立即失败' }, { id: 'eventTarget', name: '目标失效保留治疗' },
  { id: 'damageFormula', name: '独立倍率伤害' }, { id: 'damageMulti', name: '每段独立取整' }, { id: 'damageWave', name: '群体同步击杀' },
  { id: 'damagePartial', name: '群体部分击杀' }, { id: 'damageKinds', name: '伤害来源分类' },
  ...Object.entries(pushFixtures).map(([id, fixture]) => ({ id, name: fixture.name })),
  ...Object.entries(weatherFixtures).map(([id, fixture]) => ({ id, name: fixture.name })),
  ...Object.entries(rewardFixtures).map(([id, fixture]) => ({ id, name: fixture.name })) ];
export function createScenario(id: string, seed = prototype.seed): State {
  const weatherFixture = weatherFixtures[id];
  const rewardFixture = rewardFixtures[id];
  const s = createBattle(0, seed, undefined, [], weatherFixture ? { initialWeather: weatherFixture.initial, attributes: weatherFixture.attributes }
    : rewardFixture ? { initialWeather: 'rain', attributes: rewardFixture.attributes } : {});
  s.scenario = id; s.log = ['开发局面：固定手牌，仅用于规则验收。'];
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
  if (['damageFormula', 'damageMulti', 'damageKinds'].includes(id)) {
    s.enemies = [{ ...s.enemies[1], id: 1, hp: 30, maxHp: 30, position: 9 }];
    s.hand = [{ id: 0, key: id === 'damageFormula' ? 'debugFormula' : id === 'damageMulti' ? 'debugMulti' : 'strike' }];
    s.draw = []; s.discard = [];
    if (id === 'damageKinds') {
      s.damageModifiers.push({ id: 'test_card_only', kind: 'card', multipliers: [2] });
      registerListener(s, { key: 'test_relic_damage', name: '遗物伤害（测试）', kind: 'relic', listensTo: ['CARD_PLAYED'],
        effects: [{ type: 'damage', target: 'eventTarget', amount: 4 }], limit: { scope: 'unlimited' }, allowChain: false });
      registerListener(s, { key: 'test_indirect_damage', name: '间接伤害（测试）', kind: 'temporary', snapshot: 'eventStart', listensTo: ['CARD_PLAYED'],
        effects: [{ type: 'damage', target: 'eventTarget', amount: 4 }], limit: { scope: 'unlimited' }, allowChain: false });
    }
  }
  if (id === 'damageWave' || id === 'damagePartial') {
    s.player.hp = 7;
    const survivor = { ...s.enemies[1], id: 2, position: 10 };
    s.enemies = [{ ...s.enemies[0], id: 3, hp: 3, position: 4 }, { ...s.enemies[0], id: 1, hp: 2, position: 8 }];
    if (id === 'damagePartial') s.enemies.push(survivor);
    s.hand = [{ id: 0, key: 'debugWave' }]; s.draw = []; s.discard = [];
    registerListener(s, testRelics.lastHeal);
  }
  const pushFixture = pushFixtures[id];
  if (pushFixture) {
    s.player.position = pushFixture.player;
    s.player.hp = pushFixture.hp ?? s.player.maxHp;
    s.enemies = pushFixture.units.map(unit => ({ ...enemies[unit.kind], ...unit, maxHp: enemies[unit.kind].hp }));
    s.hand = [{ id: 0, key: pushFixture.card }]; s.draw = []; s.discard = [];
    if (pushFixture.collisionHeal) registerListener(s, { key: 'test_collision_heal', name: '碰撞治疗（测试）', kind: 'relic',
      listensTo: ['COLLISION'], effects: [{ type: 'heal', amount: 1 }], limit: { scope: 'unlimited' }, allowChain: false });
  }
  if (weatherFixture) {
    s.enemies = [{ ...enemies.brute, id: 1, kind: 'brute', position: 11, hp: 1000, maxHp: 1000, speed: 0, damage: 0 }];
    s.hand = [{ id: 0, key: weatherFixture.card }]; s.draw = []; s.discard = [];
    if (weatherFixture.sourceDemo) {
      registerListener(s, { key: 'test_weather_relic', name: '遗物伤害（测试）', kind: 'relic', listensTo: ['CARD_PLAYED'],
        effects: [{ type: 'damage', target: 'eventTarget', amount: 10 }], limit: { scope: 'unlimited' }, allowChain: false });
      registerListener(s, { key: 'test_weather_indirect', name: '间接伤害（测试）', kind: 'temporary', snapshot: 'eventStart', listensTo: ['CARD_PLAYED'],
        effects: [{ type: 'damage', target: 'eventTarget', amount: 10 }], limit: { scope: 'unlimited' }, allowChain: false });
    }
  }
  if (rewardFixture) {
    s.player.hp = rewardFixture.hp ?? s.player.maxHp;
    s.enemies = rewardFixture.units.map(unit => ({ ...enemies.brute, ...unit, kind: 'brute', maxHp: enemies.brute.hp }));
    s.hand = rewardFixture.cards.map((key, id) => ({ key, id })); s.draw = []; s.discard = [];
  }
  // Fixtures have deliberate custom decks; keep their permanent registry in sync.
  s.deck = [...s.hand, ...s.draw, ...s.discard, ...s.exhaust, ...s.executing]
    .map(card => createDeck([card.key], card.id)[0]);
  // A fixture starts at its preset state; omit the discarded normal opening.
  s.events = []; s.eventHistory = []; s.eventTrace = []; s.nextEventId = 1; s.nextDamageBatchId = 1;
  s.pushHistory = []; s.nextPushBatchId = 1;
  s.scoring = createScoring(s.enemies);
  return s;
}
