import { describe, expect, it, vi } from 'vitest';
import { calculateDamage, resolveDamageBatch } from '../src/game/damage';
import { createBattle } from '../src/game/state';
import { createScenario } from '../src/game/scenarios';
import { createDeck } from '../src/game/deck';
import { damageEnemy, damageEnemies, damagePlayer, losePlayerHp } from '../src/game/resolution';
import { act } from '../src/game/actions';
import { registerListener } from '../src/game/listeners';
import { processEvents } from '../src/game/eventQueue';
import * as events from '../src/game/events';
import { cards } from '../src/content/cards';
import type { DamageRequest, ListenerDefinition } from '../src/game/model';

const enemy = (id: number) => ({ kind: 'enemy', id } as const);
const damageFacts = (s: ReturnType<typeof createBattle>) => s.eventHistory.filter(event => event.type === 'DAMAGE_RESOLVED');

describe('步骤3：统一伤害公式', () => {
  it('基础10分别乘1.2和1.3，得到16', () => {
    expect(calculateDamage(10, { multipliers: [1.2, 1.3] })).toBe(16);
  });

  it('先合计固定修正，再乘独立倍率，不在中途取整', () => {
    expect(calculateDamage(10, { flat: [2, -1], multipliers: [1.2, 1.3] })).toBe(18);
    expect(calculateDamage(1, { multipliers: [1.2, 1.2] })).toBe(2);
    expect(calculateDamage(-2, { flat: [3], multipliers: [2] })).toBe(2);
  });

  it('最终负伤害归零，0倍率得到0，不转为治疗', () => {
    expect(calculateDamage(4, { flat: [-10] })).toBe(0);
    expect(calculateDamage(10, { multipliers: [0, 1.3] })).toBe(0);
    expect(calculateDamage(0)).toBe(0);
  });

  it('十进制计算不受二进制浮点越界取整影响，支持科学计数法', () => {
    expect(calculateDamage(100, { multipliers: [1.1] })).toBe(110);
    expect(calculateDamage(0.7, { flat: [0.1, 0.2] })).toBe(1);
    expect(calculateDamage(1e-7, { multipliers: [1e7] })).toBe(1);
    expect(calculateDamage(1.0000000000000002)).toBe(2);
  });

  it('非有限数值或不能精确表示的结果报错，不写入战斗数据', () => {
    expect(() => calculateDamage(NaN)).toThrow('有限');
    expect(() => calculateDamage(2, { multipliers: [Infinity] })).toThrow('有限');
    expect(() => calculateDamage(Number.MAX_SAFE_INTEGER, { multipliers: [2] })).toThrow('整数范围');
  });

  it('卡牌每段独立计算，三段1×1.2结算为2、2、2', () => {
    const s = createScenario('damageMulti');
    const n = act(s, { type: 'play', cardId: 0, target: 1 });
    expect(damageFacts(n).map(event => event.value)).toEqual([2, 2, 2]);
    expect(damageFacts(n).map(event => event.batchId)).toEqual([1, 2, 3]);
    expect(n.enemies[0].hp).toBe(24);
    expect(s.enemies[0].hp).toBe(30);
  });

  it('多段目标死亡后停止，不对其他敌人自动转移剩余段', () => {
    const s = createScenario('damageMulti');
    s.enemies[0].hp = 3;
    s.enemies.push({ ...s.enemies[0], id: 2, hp: 20, position: 11 });
    const n = act(s, { type: 'play', cardId: 0, target: 1 });
    expect(damageFacts(n).map(event => event.value)).toEqual([2, 2]);
    expect(n.enemies.map(unit => [unit.id, unit.hp])).toEqual([[2, 20]]);
  });

  it('按目标与类别独立筛选修正，同批各目标计算自己的最终伤害', () => {
    const s = createScenario('damagePartial');
    s.enemies.forEach(unit => { unit.hp = 30; unit.maxHp = 30; });
    s.damageModifiers = [
      { id: 'card', kind: 'card', flat: [1], multipliers: [1.2] },
      { id: 'enemy-one', target: enemy(1), flat: [2], multipliers: [1.3] },
      { id: 'relic-only', kind: 'relic', multipliers: [100] },
    ];
    const results = damageEnemies(s, [3, 1, 2], 4, { kind: 'card' });
    expect(results.map(result => [result.target.id, result.resolved])).toEqual([[1, 11], [3, 6], [2, 6]]);
  });

  it('卡牌来源的间接伤害可显式分类，不自动获得card修正', () => {
    const s = createScenario('damageFormula');
    s.damageModifiers = [{ id: 'card-only', kind: 'card', multipliers: [2] }];
    events.withEventContext(s, { source: { kind: 'card', id: 0, key: 'push' }, parentId: null, allowChain: true },
      () => damageEnemy(s, 1, 4, { kind: 'indirect' }));
    expect(damageFacts(s)[0]).toMatchObject({ source: { kind: 'card', key: 'push' }, value: 4, damage: { kind: 'indirect' } });
  });

  it('卡牌、遗物与临时监听的伤害类别分开，专属修正不会串入其他来源', () => {
    const n = act(createScenario('damageKinds'), { type: 'play', cardId: 0, target: 1 });
    expect(damageFacts(n).map(event => [event.value, event.damage?.kind])).toEqual([[8, 'card'], [4, 'relic'], [4, 'indirect']]);
    expect(n.enemies[0].hp).toBe(14);
  });

  it('怪物接触伤害也经过统一公式并明确标为contact', () => {
    const s = createScenario('lethal'); s.player.hp = 20;
    s.damageModifiers = [{ id: 'contact-reduction', kind: 'contact', flat: [-1], multipliers: [0.5] }];
    const n = act(s, { type: 'endTurn' });
    expect(n.player.hp).toBe(19);
    expect(damageFacts(n)[0]).toMatchObject({ value: 1, damage: { kind: 'contact', base: 3, hpLost: 1 } });
  });

  it('直接生命损失绕过伤害修正，不生成伤害事件或伤害批次', () => {
    const s = createScenario('eventLethal'); s.player.hp = 10;
    s.damageModifiers = [{ id: 'zero-damage', multipliers: [0] }];
    const before = s.nextDamageBatchId;
    losePlayerHp(s, 3);
    expect(s.player.hp).toBe(7); expect(damageFacts(s)).toEqual([]);
    expect(s.eventHistory[0]).toMatchObject({ type: 'HP_LOST', value: 3, hpLossCause: 'direct' });
    expect(s.nextDamageBatchId).toBe(before);
  });

  it('0伤害只生成伤害事件，直接0点生命损失不生成任何事件', () => {
    const s = createScenario('damageFormula');
    damageEnemy(s, 1, 4, { multipliers: [0] });
    losePlayerHp(s, 0);
    expect(s.enemies[0].hp).toBe(30);
    expect(s.eventHistory.map(event => event.type)).toEqual(['DAMAGE_RESOLVED']);
  });

  it('过量伤害保留结算值，HP_LOST及伤害详情只记录实际扣血', () => {
    const s = createScenario('damageFormula'); s.enemies[0].hp = 3;
    damageEnemy(s, 1, 10, { multipliers: [1.2, 1.3] });
    expect(s.eventHistory.map(event => [event.type, event.value])).toEqual([['DAMAGE_RESOLVED', 16], ['HP_LOST', 3], ['ENEMY_DIED', 0]]);
    expect(damageFacts(s)[0].damage).toMatchObject({ resolved: 16, hpLost: 3, hpBefore: 3, hpAfter: 0 });
  });

  it('没有合法目标时不记录虚假的0伤害，空批次不消耗批次编号', () => {
    const s = createScenario('damageFormula');
    const before = s.nextDamageBatchId;
    expect(damageEnemies(s, [99, 100], 10)).toEqual([]);
    expect(resolveDamageBatch(s, [])).toEqual([]);
    expect(s.eventHistory).toEqual([]); expect(s.nextDamageBatchId).toBe(before);
  });
});

describe('步骤3：同步伤害批次与事件', () => {
  it('在第一条伤害事实记录前就已更新全部生命并统一移除死亡目标', () => {
    const s = createScenario('damagePartial');
    const original = events.recordEvent;
    const observed: number[][][] = [];
    const spy = vi.spyOn(events, 'recordEvent').mockImplementation((state, type, data, legacy) => {
      if (type === 'DAMAGE_RESOLVED') observed.push(state.enemies.map(unit => [unit.id, unit.hp]));
      return original(state, type, data, legacy);
    });
    try { damageEnemies(s, [3, 2, 1], 4); } finally { spy.mockRestore(); }
    expect(observed).toEqual([[[2, 6]], [[2, 6]], [[2, 6]]]);
  });

  it('批次事件按全部伤害、全部实际生命损失、死亡排列，同距按编号排序', () => {
    const s = createScenario('damagePartial');
    damageEnemies(s, [2, 3, 1], 4, { kind: 'card' });
    expect(s.eventHistory.map(event => [event.type, event.target?.id])).toEqual([
      ['DAMAGE_RESOLVED', 1], ['DAMAGE_RESOLVED', 3], ['DAMAGE_RESOLVED', 2],
      ['HP_LOST', 1], ['HP_LOST', 3], ['HP_LOST', 2], ['ENEMY_DIED', 1], ['ENEMY_DIED', 3],
    ]);
    expect(new Set(s.eventHistory.map(event => event.batchId))).toEqual(new Set([1]));
    for (const event of s.eventHistory.filter(event => event.type !== 'DAMAGE_RESOLVED')) {
      const parent = s.eventHistory.find(candidate => candidate.id === event.parentId)!;
      expect(parent.type).toBe('DAMAGE_RESOLVED'); expect(parent.target).toEqual(event.target);
    }
  });

  it('目标请求和敌人数组的排列不会改变生命结果、事件顺序或批次归属', () => {
    const run = (ids: number[], reverse: boolean) => {
      const s = createScenario('damagePartial');
      if (reverse) s.enemies.reverse();
      damageEnemies(s, ids, 4, { kind: 'card' });
      return { enemies: s.enemies, history: s.eventHistory, phase: s.phase };
    };
    expect(run([1, 2, 3], false)).toEqual(run([3, 2, 1], true));
    expect(run([1, 2, 3], false)).toEqual(run([2, 1, 3], false));
  });

  it('目标集合去重，重复ID不会造成额外一段伤害', () => {
    const s = createScenario('damageFormula');
    const results = damageEnemies(s, [1, 1, 1], 4);
    expect(results).toHaveLength(1); expect(s.enemies[0].hp).toBe(26);
  });

  it('无效公式或原始重复请求在写入任何目标之前报错，整批状态不变', () => {
    const s = createScenario('damagePartial');
    const before = structuredClone(s);
    const first: DamageRequest = { target: enemy(1), base: 2, kind: 'card' };
    expect(() => resolveDamageBatch(s, [first, { target: enemy(2), base: 2, kind: 'card', multipliers: [NaN] }])).toThrow('有限');
    expect(s).toEqual(before);
    expect(() => resolveDamageBatch(s, [first, first])).toThrow('重复');
    expect(s).toEqual(before);
  });

  it('群体0伤害对每个合法目标记录结算，无生命减少或死亡事件', () => {
    const s = createScenario('damageWave');
    damageEnemies(s, s.enemies.map(unit => unit.id), 0);
    expect(s.eventHistory.map(event => event.type)).toEqual(['DAMAGE_RESOLVED', 'DAMAGE_RESOLVED']);
    expect(s.enemies.map(unit => unit.hp)).toEqual([3, 2]);
  });

  it('群体最后击杀后完成本牌治疗和每个独立死亡触发再胜利', () => {
    const n = act(createScenario('damageWave'), { type: 'play', cardId: 0 });
    expect(n.enemies).toEqual([]); expect(n.player.hp).toBe(15);
    expect(n.status).toBe('won'); expect(n.finishReason).toBe('last-kill'); expect(n.eventQueue).toEqual([]);
    expect(n.eventHistory.filter(event => event.type === 'HEALED').map(event => event.value)).toEqual([2, 3, 3]);
    expect(n.eventHistory.filter(event => event.type === 'ENEMY_DIED')).toHaveLength(2);
    expect(n.listeners[0].totalTriggers).toBe(2);
  });

  it('部分群体击杀不提前判胜，存活敌人保留同步扣血后的生命', () => {
    const n = act(createScenario('damagePartial'), { type: 'play', cardId: 0 });
    expect(n.status).toBe('playing'); expect(n.phase).toBe('player'); expect(n.player.hp).toBe(15);
    expect(n.enemies.map(unit => [unit.id, unit.hp])).toEqual([[2, 6]]);
  });

  it('同批双方死亡先完整记录全部事实，再按玩家失败立即取消队列', () => {
    const s = createScenario('damageFormula'); s.player.hp = 1; s.enemies[0].hp = 1;
    resolveDamageBatch(s, [{ target: enemy(1), base: 1, kind: 'indirect' }, { target: events.playerRef, base: 1, kind: 'indirect' }]);
    expect(s.player.hp).toBe(0); expect(s.enemies).toEqual([]);
    expect(s.status).toBe('lost'); expect(s.finishReason).toBe('player-death');
    expect(s.eventHistory.map(event => event.type)).toEqual(['DAMAGE_RESOLVED', 'DAMAGE_RESOLVED', 'HP_LOST', 'HP_LOST', 'ENEMY_DIED']);
    expect(s.eventQueue).toEqual([]); expect(s.eventTrace.filter(row => row.kind === 'cancel')).toHaveLength(5);
  });

  it('多段群体效果每段建立独立批次，后续段只锁定仍存活目标', () => {
    cards.testMultiWave = { name: '测试', kind: '测试', description: '测试', target: 'none',
      effects: [{ type: 'damageAll', amount: 1, hits: 3, multipliers: [1.2] }] };
    try {
      const s = createBattle(0, 157, createDeck(['testMultiWave']));
      s.enemies[0].hp = 1;
      const n = act(s, { type: 'play', cardId: 0 });
      const facts = damageFacts(n);
      expect(facts.map(event => event.value)).toEqual([2, 2, 2, 2]);
      expect(facts.map(event => event.batchId)).toEqual([1, 1, 2, 3]);
      expect(n.enemies.map(unit => [unit.id, unit.hp])).toEqual([[2, 4]]);
    } finally { delete cards.testMultiWave; }
  });

  it('遗物伤害不在最终倍率之前提前取整', () => {
    const s = createScenario('damageFormula');
    const listener: ListenerDefinition = { key: 'fraction', name: 'fraction', kind: 'relic', listensTo: ['CARD_PLAYED'],
      effects: [{ type: 'damage', target: 'nearest', amount: { base: 1.2, multiplier: 1.2 }, multipliers: [1.2] }],
      limit: { scope: 'unlimited' }, allowChain: false };
    registerListener(s, listener); events.recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(damageFacts(s).map(event => event.value)).toEqual([2]);
  });

  it('遗物派生数值保留十进制乘积，已损生命3×0.1再乘10恰好为3', () => {
    const s = createScenario('damageFormula'); s.player.hp = 17;
    registerListener(s, { key: 'decimal-derived', name: 'decimal-derived', kind: 'relic', listensTo: ['CARD_PLAYED'],
      effects: [{ type: 'damage', target: 'nearest', amount: { missingHp: 0.1, multiplier: 10 } }],
      limit: { scope: 'unlimited' }, allowChain: false });
    events.recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(damageFacts(s).map(event => event.value)).toEqual([3]);
    expect(damageFacts(s)[0].damage?.baseTerms).toContainEqual({ value: 3, coefficient: 0.1 });
  });

  it('派生数值略大于整数时不在转换数值时丢失尾数', () => {
    expect(calculateDamage(1, {}, [{ value: 1e-16, coefficient: 1 }])).toBe(2);
  });

  it('群体遗物在批次开始时读取所有目标生命，按各目标独立公式计算', () => {
    const s = createScenario('damageWave'); s.enemies[0].hp = 9; s.enemies[1].hp = 4;
    registerListener(s, { key: 'half-wave', name: 'half-wave', kind: 'relic', listensTo: ['CARD_PLAYED'],
      effects: [{ type: 'damageAll', amount: { targetHp: 0.5 }, flat: [0.1], multipliers: [1.2] }],
      limit: { scope: 'unlimited' }, allowChain: false });
    events.recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(s.enemies.map(unit => [unit.id, unit.hp])).toEqual([[3, 3], [1, 1]]);
    expect(damageFacts(s).map(event => [event.target?.id, event.value, event.damage?.kind])).toEqual([[1, 3, 'relic'], [3, 6, 'relic']]);
    expect(new Set(damageFacts(s).map(event => event.batchId)).size).toBe(1);
  });

  it('监听可区分直接生命损失、伤害扣血以及伤害类别', () => {
    const s = createScenario('damageFormula'); s.player.hp = 10;
    for (const [key, condition] of [
      ['direct-only', { type: 'hpLossCause', cause: 'direct' }],
      ['damage-only', { type: 'hpLossCause', cause: 'damage' }],
      ['contact-only', { type: 'damageKind', kind: 'contact' }],
    ] as const) registerListener(s, { key, name: key, kind: 'relic', listensTo: ['HP_LOST'], condition,
      effects: [], limit: { scope: 'unlimited' }, allowChain: false });
    losePlayerHp(s, 1); damagePlayer(s, 1, { kind: 'contact' }); processEvents(s);
    expect(s.listeners.map(listener => listener.totalTriggers)).toEqual([1, 1, 1]);
  });

  it('群体结果与批次可JSON往返，队列恢复后回放结果一致', () => {
    const s = createScenario('damageWave');
    damageEnemies(s, [3, 1], 4);
    const restored = JSON.parse(JSON.stringify(s));
    processEvents(s); processEvents(restored);
    expect(restored).toEqual(s); expect(s.status).toBe('won');
  });
});
