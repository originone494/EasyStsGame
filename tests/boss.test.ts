import { describe, expect, it } from 'vitest';
import { createBattle, createBossBattle, type State } from '../src/game/state';
import { createScenario } from '../src/game/scenarios';
import { act } from '../src/game/actions';
import { damageEnemy, damageEnemies, damagePlayer, losePlayerHp, settle } from '../src/game/resolution';
import { processEvents } from '../src/game/eventQueue';
import { addBossDamage, bossScore, bossSucceeded, createBoss } from '../src/game/boss';
import { advanceEnemy, pushEnemy } from '../src/game/movement';
import { registerListener } from '../src/game/listeners';
import { finishBattle, recordEvent } from '../src/game/events';
import { calculateBossRewards, grantBattleRewards } from '../src/game/rewards';
import { bossRewardConfig, zeroAttributes } from '../src/content/economy';
import { continueBattle } from '../src/game/progression';
import { result } from '../src/ui/panels';
import { scorePanel } from '../src/ui/rewards';
import { resolveDamageBatch } from '../src/game/damage';
import { createScoring } from '../src/game/scoring';

function preset(s: State, damage: number) {
  s.boss!.accumulatedDamage = damage;
  s.enemies.find(enemy => enemy.id === s.boss!.enemyId)!.hp = Math.max(0, s.boss!.baseMaxHp - damage);
  return s;
}
const bossDamageEvents = (s: State) => s.eventHistory.filter(event => event.type === 'DAMAGE_RESOLVED' && event.target?.kind === 'enemy' && event.target.id === s.boss!.enemyId);

describe('步骤7：Boss独立伤害与实际生命减少', () => {
  it('Boss初始明确编号与正生命基准，不加入普通评分分母', () => {
    const s = createBossBattle();
    expect(s.boss).toEqual({ enemyId: 1, baseMaxHp: 100, accumulatedDamage: 0, hasContactedPlayer: false });
    expect(s.scoring).toEqual([]); expect(s.enemies[0]).toMatchObject({ hp: 100, maxHp: 100 });
    expect(s.deck).toHaveLength(7); expect(s.hand).toHaveLength(3); expect(createBattle().boss).toBeNull();
  });

  it('110伤害完整计分，只实际扣100生命；归零后仍可继续受10伤害', () => {
    const s = createBossBattle();
    damageEnemy(s, 1, 110); processEvents(s);
    expect(s.status).toBe('playing'); expect(s.lastKillPending).toBe(false); expect(s.enemies[0].hp).toBe(0);
    damageEnemy(s, 1, 10); processEvents(s);
    expect(s.boss!.accumulatedDamage).toBe(120); expect(s.enemies).toHaveLength(1);
    expect(bossDamageEvents(s).map(event => [event.value, event.damage!.hpLost, event.damage!.bossAccumulatedDamage]))
      .toEqual([[110, 100, 110], [10, 0, 120]]);
    expect(s.eventHistory.filter(event => event.type === 'HP_LOST').map(event => event.value)).toEqual([100]);
    expect(s.eventHistory.some(event => event.type === 'ENEMY_DIED')).toBe(false);
    expect(s.reward).toBeNull(); expect(s.gold).toBe(0);
  });

  it('99%时3段攻击跨过100%，所有段继续执行，实际生命只减少1', () => {
    const s = act(createScenario('bossMulti'), { type: 'play', cardId: 0, target: 1 });
    expect(s.boss!.accumulatedDamage).toBe(105); expect(s.status).toBe('playing');
    expect(bossDamageEvents(s).map(event => event.damage!.hpLost)).toEqual([1, 0, 0]);
    expect(s.enemies[0].hp).toBe(0); expect(s.discard[0].key).toBe('combo');
  });

  it('0生命Boss的0伤害照常记录伤害事实，不增加输出或生命减少', () => {
    const s = preset(createBossBattle(), 100); damageEnemy(s, 1, 0); processEvents(s);
    expect(bossDamageEvents(s).map(event => event.value)).toEqual([0]);
    expect(s.boss!.accumulatedDamage).toBe(100);
    expect(s.eventHistory.some(event => event.type === 'HP_LOST' || event.type === 'ENEMY_DIED')).toBe(false);
  });

  it('卡牌、遗物和明确间接伤害按最终修正结果计分', () => {
    const s = createBossBattle(1, 157, undefined, [], { initialWeather: 'sun', attributes: { sunAdaptation: 40 } });
    damageEnemy(s, 1, 10, { kind: 'card', multipliers: [1.2, 1.3] });
    damageEnemy(s, 1, 10, { kind: 'relic' }); damageEnemy(s, 1, 10, { kind: 'indirect' }); processEvents(s);
    expect(bossDamageEvents(s).map(event => event.value)).toEqual([22, 10, 10]);
    expect(s.boss!.accumulatedDamage).toBe(42); expect(s.enemies[0].hp).toBe(58);
  });

  it('群伤只给Boss累计自身伤害，小怪正常记账并产生死亡', () => {
    const s = createScenario('bossMixed'); damageEnemies(s, [1, 2], 110); processEvents(s);
    expect(s.boss!.accumulatedDamage).toBe(110); expect(s.status).toBe('playing');
    expect(s.enemies.map(enemy => enemy.id)).toEqual([1]); expect(s.enemies[0].hp).toBe(0);
    expect(s.scoring).toEqual([{ id: 2, maxHp: 4, hpLost: 4, disposition: 'killed' }]);
    expect(s.eventHistory.filter(event => event.type === 'ENEMY_DIED').map(event => event.target!.id)).toEqual([2]);
  });

  it('伤害监听可对0生命Boss继续输出，生命减少与击杀监听不被伪造', () => {
    const s = preset(createBossBattle(), 100);
    registerListener(s, { key: 'echo', name: 'echo', kind: 'relic', listensTo: ['DAMAGE_RESOLVED'],
      effects: [{ type: 'damage', target: 'eventTarget', amount: 3 }], limit: { scope: 'battle', count: 1 }, allowChain: false });
    registerListener(s, { key: 'no-hp-loss', name: 'no-hp-loss', kind: 'relic', listensTo: ['HP_LOST', 'ENEMY_DIED'],
      effects: [], limit: { scope: 'unlimited' }, allowChain: true });
    damageEnemy(s, 1, 2); processEvents(s);
    expect(s.boss!.accumulatedDamage).toBe(105); expect(s.listeners.map(listener => listener.totalTriggers)).toEqual([1, 0]);
  });

  it('实际扣至0产生HP_LOST，相关监听只在这次实际减少时触发', () => {
    const s = preset(createBossBattle(), 99);
    registerListener(s, { key: 'hp', name: 'hp', kind: 'relic', listensTo: ['HP_LOST'], effects: [],
      limit: { scope: 'unlimited' }, allowChain: true });
    damageEnemy(s, 1, 5); processEvents(s); damageEnemy(s, 1, 5); processEvents(s);
    expect(s.listeners[0].totalTriggers).toBe(1); expect(s.boss!.accumulatedDamage).toBe(109);
  });

  it('累计伤害溢出在写入任何目标生命或批次计数之前拒绝', () => {
    const s = createScenario('bossMixed'); s.boss!.accumulatedDamage = Number.MAX_SAFE_INTEGER;
    const before = structuredClone(s);
    expect(() => damageEnemies(s, [2, 1], 1)).toThrow('安全整数'); expect(s).toEqual(before);
  });

  it('非法群伤不部分更新Boss累计或其他目标', () => {
    const s = createScenario('bossMixed'), before = structuredClone(s);
    expect(() => resolveDamageBatch(s, [{ target: { kind: 'enemy', id: 1 }, kind: 'card', base: 5 },
      { target: { kind: 'enemy', id: 2 }, kind: 'card', base: NaN }])).toThrow('有限');
    expect(s).toEqual(before);
  });
});

describe('步骤7：接触截止、击退与混合战斗', () => {
  it.each([[99, 'lost'], [100, 'won'], [110, 'won'], [600, 'won']] as const)('%s%接触判定%s，接触不扣生命', (damage, status) => {
    const s = preset(createScenario('boss100'), damage); s.enemies[0].damage = 999;
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe(status); expect(n.finishReason).toBe('boss-contact');
    expect(n.boss!.hasContactedPlayer).toBe(true); expect(n.boss!.accumulatedDamage).toBe(damage);
    expect(n.player.hp).toBe(20); expect(n.enemies).toHaveLength(1); expect(n.eventQueue).toEqual([]);
    expect(n.eventHistory.filter(event => event.type === 'DAMAGE_RESOLVED' || event.type === 'HP_LOST')).toEqual([]);
    expect(n.eventHistory.filter(event => event.type === 'ENEMY_CONTACT').map(event => event.value)).toEqual([0]);
  });

  it('接触事件监听不能补足99%或追加治疗，已完成事实保留但待处理队列取消', () => {
    const s = createScenario('boss99'); s.player.hp = 3;
    registerListener(s, { key: 'late', name: 'late', kind: 'relic', listensTo: ['ENEMY_CONTACT'],
      effects: [{ type: 'damage', target: 'nearest', amount: 10 }, { type: 'heal', amount: 10 }],
      limit: { scope: 'unlimited' }, allowChain: true });
    recordEvent(s, 'CARD_PLAYED'); advanceEnemy(s, 1); processEvents(s);
    expect(s.status).toBe('lost'); expect(s.boss!.accumulatedDamage).toBe(99); expect(s.player.hp).toBe(3);
    expect(s.eventHistory.some(event => event.type === 'ENEMY_CONTACT')).toBe(true);
    expect(s.eventTrace.filter(trace => trace.kind === 'cancel')).toHaveLength(2);
    expect(s.listeners[0].totalTriggers).toBe(0);
  });

  it('Boss先接触时取消剩余小怪行动，即使其接触本会致死', () => {
    const s = createScenario('boss100');
    s.enemies.push({ ...s.enemies[0], id: 2, kind: 'runner', position: 5, hp: 4, maxHp: 4, speed: 1, damage: 99 });
    s.scoring = createScoring([s.enemies[1]]);
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe('won'); expect(n.player.hp).toBe(20);
    expect(n.enemies.find(enemy => enemy.id === 2)!.position).toBe(5);
    expect(n.eventHistory.filter(event => event.type === 'ENEMY_CONTACT')).toHaveLength(1);
  });

  it('小怪先造成致死接触则立即失败，不允许后续Boss接触救场', () => {
    const s = createScenario('bossMinionContact'); s.player.hp = 1;
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe('lost'); expect(n.finishReason).toBe('player-death'); expect(n.boss!.hasContactedPlayer).toBe(false);
    expect(n.reward!.eligible).toBe(false); expect(n.gold).toBe(0);
  });

  it('小怪接触消失或击杀均不结束Boss战，不改变Boss评分', () => {
    const contact = act(createScenario('bossMinionContact'), { type: 'endTurn' });
    expect(contact.status).toBe('playing'); expect(contact.boss!.accumulatedDamage).toBe(110);
    expect(contact.enemies.map(enemy => enemy.id)).toEqual([1]); expect(contact.player.hp).toBe(18);
    const killed = act(createScenario('bossMixed'), { type: 'play', cardId: 0 });
    expect(killed.status).toBe('playing'); expect(killed.boss!.accumulatedDamage).toBe(4);
    expect(killed.enemies.map(enemy => enemy.id)).toEqual([1]); expect(killed.lastKillPending).toBe(false);
  });

  it('0生命Boss正常完整击退2格，接触从本回合延迟至第3回合', () => {
    let s = act(createScenario('bossPush'), { type: 'play', cardId: 0, target: 1 });
    expect(s.enemies[0].position).toBe(9); expect(s.boss!.accumulatedDamage).toBe(100);
    for (let i = 0; i < 2; i++) { s = act(s, { type: 'endTurn' }); expect(s.status).toBe('playing'); }
    s = act(s, { type: 'endTurn' }); expect(s.status).toBe('won'); expect(s.turn).toBe(3);
  });

  it('Boss击退遵守边界、实体传递和队伍格阻挡，不触发接触', () => {
    const s = createBossBattle(); s.enemies[0].position = 11; pushEnemy(s, 1, 5);
    expect(s.enemies[0].position).toBe(12); expect(s.pushHistory[0]).toMatchObject({ moved: 1, boundaryLost: 4 });
    pushEnemy(s, 1, 10, 'toward'); expect(s.enemies[0].position).toBe(7);
    expect(s.boss!.hasContactedPlayer).toBe(false); expect(s.status).toBe('playing');
    const mixed = createScenario('bossMixed'); mixed.enemies[1].position = 11;
    pushEnemy(mixed, 1, 2); expect(mixed.enemies.map(enemy => enemy.position)).toEqual([10, 12]);
    expect(mixed.boss!.accumulatedDamage).toBe(0);
  });

  it('达到600%后生命代价致死仍失败，后续治疗取消且无奖励', () => {
    const s = preset(createScenario('bossLethal'), 600), n = act(s, { type: 'play', cardId: 0 });
    expect(n.player.hp).toBe(0); expect(n.status).toBe('lost'); expect(n.reward!.gold).toBe(0);
    expect(n.eventHistory.some(event => event.type === 'HEALED')).toBe(false);
  });

  it('终止后所有伤害、队列、回合与重复接触都不再改变最终累计或资产', () => {
    const s = act(createScenario('boss100'), { type: 'endTurn' }), before = structuredClone(s);
    damageEnemy(s, 1, 999); damagePlayer(s, 999); losePlayerHp(s, 999); advanceEnemy(s, 1); processEvents(s);
    grantBattleRewards(s); finishBattle(s, 'won', 'boss-contact'); settle(s); result(s); result(s);
    expect(s).toEqual(before); expect(s.gold).toBe(100);
  });
});

describe('步骤7：Boss精确奖励与最终通关', () => {
  it.each([[99, 0], [100, 100], [110, 110], [200, 200], [500, 500], [600, 500]])('%s%评分获得%s金币，输出评分不封顶', (damage, gold) => {
    const s = preset(createBossBattle(), damage), reward = calculateBossRewards(bossRewardConfig(), s.boss!, zeroAttributes());
    expect(reward.gold).toBe(gold); expect(reward.score.percent).toBeCloseTo(damage);
    expect(reward.rewardRatio).toBe(damage < 100 ? 0 : Math.min(damage / 100, 5));
  });

  it('伤害比例7/5、金币基准5恰好为7，避免浮点向上多发', () => {
    const boss = { ...createBossBattle().boss!, baseMaxHp: 5, accumulatedDamage: 7 };
    expect(calculateBossRewards({ ...bossRewardConfig(), baseGold: 5 }, boss, zeroAttributes()).gold).toBe(7);
  });

  it('各项先独立取整再应用楼层上限，不把溢出转为金币', () => {
    const s = preset(createBossBattle(2), 110);
    const reward = calculateBossRewards({ ...s.rewardConfig, baseAttributes: { sunAdaptation: 10, rainAdaptation: 3, windAdaptation: 0 } },
      s.boss!, { sunAdaptation: 95, rainAdaptation: 99, windAdaptation: 100 });
    expect(reward.scaledAttributes).toEqual({ sunAdaptation: 11, rainAdaptation: 4, windAdaptation: 0 });
    expect(reward.gainedAttributes).toEqual({ sunAdaptation: 5, rainAdaptation: 1, windAdaptation: 0 });
    expect(reward.overflowAttributes).toEqual({ sunAdaptation: 6, rainAdaptation: 3, windAdaptation: 0 }); expect(reward.gold).toBe(110);
  });

  it('600%实际第二层结算最多5倍基准，三项从95各加5，其余45溢出', () => {
    const s = act(createScenario('boss600'), { type: 'endTurn' });
    expect(s.gold).toBe(500); expect(s.attributes).toEqual({ sunAdaptation: 100, rainAdaptation: 100, windAdaptation: 100 });
    expect(Object.values(s.reward!.overflowAttributes)).toEqual([45, 45, 45]); expect(s.reward!.score.percent).toBe(600);
  });

  it('一二层稀有卡与一件对应品质遗物资格固定，不按输出增加或降级', () => {
    for (const floor of [1, 2]) for (const damage of [100, 600]) {
      const s = preset(createBossBattle(floor), damage), reward = calculateBossRewards(s.rewardConfig, s.boss!, zeroAttributes());
      expect(reward.cardOffer).toEqual({ choices: 3, picks: 1, canSkip: true, rarity: 'rare' });
      expect(reward.relicOffer).toEqual({ count: 1, rarity: floor === 1 ? 'common' : 'uncommon' });
    }
  });

  it('未达标、生命失败或伪造无接触成功均无金币属性卡牌遗物资格', () => {
    const s = preset(createBossBattle(), 600); finishBattle(s, 'won', 'last-kill');
    expect(s.reward).toMatchObject({ eligible: false, gold: 0, cardOffer: null, relicOffer: null });
    const failed = calculateBossRewards(bossRewardConfig(), { ...s.boss!, accumulatedDamage: 99 }, zeroAttributes());
    expect(failed).toMatchObject({ eligible: false, gold: 0, cardOffer: null, relicOffer: null });
  });

  it('第三层600%成功只显示通关评分，全部资产不变且无任何奖励资格', () => {
    const s = createScenario('bossFinal'); s.gold = 7; s.attributes.sunAdaptation = 12;
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe('won'); expect(n.gold).toBe(7); expect(n.attributes.sunAdaptation).toBe(12);
    expect(n.reward).toMatchObject({ eligible: false, gold: 0, rewardRatio: 0, cardOffer: null, relicOffer: null });
    expect(result(n)).toContain('通关成功'); expect(result(n)).toContain('600%');
    expect(result(n)).not.toMatch(/reward-summary|reward-none|继续战斗|再战一次/);
    expect(() => continueBattle(n)).toThrow('不能继续');
  });

  it('Boss失败无本场重试或继续按钮，只有重新开局', () => {
    const s = act(createScenario('boss99'), { type: 'endTurn' });
    expect(result(s)).toContain('重新开局'); expect(result(s)).not.toMatch(/再战一次|继续战斗|切换测试战斗/);
    expect(() => continueBattle(s)).toThrow('不能继续');
  });

  it('金币或缩放结果溢出时，不部分写入属性、金币或领奖标记', () => {
    const s = preset(createBossBattle(), 600); s.status = 'won'; s.finishReason = 'boss-contact'; s.boss!.hasContactedPlayer = true;
    s.gold = Number.MAX_SAFE_INTEGER; const before = structuredClone(s);
    expect(() => grantBattleRewards(s)).toThrow('安全整数'); expect(s).toEqual(before);
    expect(() => calculateBossRewards({ ...s.rewardConfig, baseGold: Number.MAX_SAFE_INTEGER }, s.boss!, zeroAttributes())).toThrow('安全整数');
  });

  it('参数非法时拒绝初始化或计分，计分函数不改原记录', () => {
    const s = createBossBattle(), before = structuredClone(s.boss!);
    expect(addBossDamage(s.boss!, 10).accumulatedDamage).toBe(10); expect(s.boss).toEqual(before);
    expect(() => createBoss(s.enemies, 99, 100)).toThrow('编号'); expect(() => createBoss(s.enemies, 1, 0)).toThrow('正安全整数');
    expect(() => addBossDamage(s.boss!, .5)).toThrow('安全整数');
    expect(() => bossScore({ ...s.boss!, accumulatedDamage: -1 })).toThrow('无效');
    expect(() => createBossBattle(4)).toThrow('1至3');
    expect(() => createBossBattle(2, 157, undefined, [], { rewardConfig: bossRewardConfig(1) })).toThrow('不一致');
    expect(bossSucceeded(s.boss!)).toBe(false);
  });

  it('JSON恢复保留归零Boss、独立累计、接触标记与已领奖状态', () => {
    const live = preset(createBossBattle(), 110), restored = JSON.parse(JSON.stringify(live));
    damageEnemy(restored, 1, 10); expect(restored.boss.accumulatedDamage).toBe(120); expect(restored.enemies[0].hp).toBe(0);
    const done = act(createScenario('boss100'), { type: 'endTurn' }), saved = JSON.parse(JSON.stringify(done));
    grantBattleRewards(saved); expect(saved).toEqual(done);
    expect(scorePanel(restored)).toContain('120%');
  });
});
