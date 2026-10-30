import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/game/state';
import { createScenario } from '../src/game/scenarios';
import { act } from '../src/game/actions';
import { createScoring, recordEnemyHpLoss, summarizeScore } from '../src/game/scoring';
import { calculateNonBossRewards, grantBattleRewards, validateRewardConfig } from '../src/game/rewards';
import { damageEnemy, damageEnemies, damagePlayer } from '../src/game/resolution';
import { processEvents } from '../src/game/eventQueue';
import { finishBattle } from '../src/game/events';
import { registerListener } from '../src/game/listeners';
import { continueBattle } from '../src/game/progression';
import { normalRewardConfig, zeroAttributes } from '../src/content/economy';
import { resolveDamageBatch } from '../src/game/damage';
import { result } from '../src/ui/panels';
import { nextRandom } from '../src/game/random';

function finishFixture(id: string) {
  let s = createScenario(id);
  if (s.hand.some(card => card.key === 'debugScoreKill')) s = act(s, { type: 'play', cardId: 0, target: 1 });
  if (s.status === 'playing' && s.hand.some(card => card.key === 'debugScoreChip')) s = act(s, { type: 'play', cardId: 1, target: 2 });
  if (s.status === 'playing') s = act(s, { type: 'endTurn' });
  return s;
}

describe('步骤6：有效生命损失评分', () => {
  it('0／50／75／100%实际战斗分别获得20／60／80／100%基准奖励', () => {
    for (const [id, score, gold, points] of [
      ['scoreZero', 0, 4, 1], ['scoreHalf', 50, 12, 3], ['scoreSeventyFive', 75, 16, 4], ['scoreFull', 100, 20, 5],
    ] as const) {
      const s = finishFixture(id);
      expect(s.status).toBe('won'); expect(s.reward?.score.percent).toBe(score);
      expect(s.gold).toBe(gold); expect(s.attributes.sunAdaptation).toBe(points);
    }
  });

  it('击杀一只10生命、另一只扣5后接触消失，记录保留且评分75%', () => {
    const s = finishFixture('scoreSeventyFive');
    expect(s.enemies).toEqual([]);
    expect(s.scoring).toEqual([
      { id: 1, maxHp: 10, hpLost: 10, disposition: 'killed' },
      { id: 2, maxHp: 10, hpLost: 5, disposition: 'contact' },
    ]);
    expect(s.reward?.score).toEqual({ hpLost: 15, maxHp: 20, ratio: 0.75, percent: 75 });
    expect(s.eventHistory.filter(event => event.type === 'ENEMY_DIED')).toHaveLength(1);
  });

  it('按总生命加权，不把10与30生命两只怪物平均计算', () => {
    const s = createScenario('scoreHalf'); s.enemies[1].hp = 30; s.enemies[1].maxHp = 30; s.scoring = createScoring(s.enemies);
    let n = act(s, { type: 'play', cardId: 0, target: 1 }); n = act(n, { type: 'endTurn' });
    expect(n.reward?.score.percent).toBe(25); expect(n.gold).toBe(8);
  });

  it('过量伤害只计实际生命损失，接触消失不补足剩余生命', () => {
    const s = createScenario('scoreHalf');
    damageEnemy(s, 1, 100); processEvents(s);
    expect(summarizeScore(s.scoring).hpLost).toBe(10);
    const n = act(s, { type: 'endTurn' });
    expect(n.reward?.score.percent).toBe(50); expect(n.scoring[1].hpLost).toBe(0);
  });

  it('所有伤害来源的实际怪物扣血都计分，0伤害与玩家扣血不计分', () => {
    const s = createScenario('scoreFull');
    for (const kind of ['card', 'relic', 'indirect'] as const) damageEnemy(s, 1, 1, { kind });
    damageEnemy(s, 1, 0); damagePlayer(s, 1, { kind: 'contact' });
    expect(summarizeScore(s.scoring).hpLost).toBe(3);
    expect(s.player.hp).toBe(19);
  });

  it('每只怪物计分封顶原始最大生命，重复扣血不能超出100%', () => {
    const s = createScenario('scoreFull');
    damageEnemy(s, 1, 6); s.enemies[0].hp = 10; damageEnemy(s, 1, 6);
    expect(s.scoring[0].hpLost).toBe(10); expect(summarizeScore(s.scoring).percent).toBe(100);
    expect(s.scoring[0].maxHp).toBe(10);
  });

  it('群体同步扣血和同步死亡分别记账，已移除目标仍保留分母', () => {
    const s = createScenario('scoreHalf');
    damageEnemies(s, [2, 1], 10); processEvents(s);
    expect(s.reward?.score).toMatchObject({ hpLost: 20, maxHp: 20, percent: 100 });
    expect(s.scoring.every(record => record.disposition === 'killed')).toBe(true);
  });

  it('非法新增目标的计分配置在伤害写入前报错，整批不部分生效', () => {
    const s = createScenario('scoreHalf'); s.enemies[1].id = 99; s.enemies[1].maxHp = 0;
    const before = structuredClone(s);
    expect(() => resolveDamageBatch(s, [{ target: { kind: 'enemy', id: 1 }, base: 2, kind: 'card' },
      { target: { kind: 'enemy', id: 99 }, base: 2, kind: 'card' }])).toThrow('最大生命');
    expect(s).toEqual(before);
  });

  it('拒绝重复编号、非法最大生命及非法损失，空记录评分为0', () => {
    expect(() => createScoring([{ id: 1, maxHp: 10 }, { id: 1, maxHp: 10 }])).toThrow('编号');
    expect(() => createScoring([{ id: 1, maxHp: 0 }])).toThrow('最大生命');
    const s = createScenario('scoreFull');
    expect(() => recordEnemyHpLoss(s, s.enemies[0], 0.5)).toThrow('安全整数');
    expect(summarizeScore([])).toEqual({ hpLost: 0, maxHp: 0, ratio: 0, percent: 0 });
  });
});

describe('步骤6：精确奖励公式与楼层上限', () => {
  it('分数3/7、基准35恰好奖励19，不被浮点误差向上多取1', () => {
    const config = normalRewardConfig('sunAdaptation'); config.baseGold = 35;
    expect(calculateNonBossRewards(config, { hpLost: 3, maxHp: 7 }, zeroAttributes()).gold).toBe(19);
  });

  it('金币和每项属性独立计算，不能合计后统一取整', () => {
    const config = normalRewardConfig('sunAdaptation'); config.baseAttributes = { sunAdaptation: 5, rainAdaptation: 2, windAdaptation: 7 };
    const reward = calculateNonBossRewards(config, { hpLost: 1, maxHp: 2 }, zeroAttributes());
    expect(reward.gold).toBe(12);
    expect(reward.gainedAttributes).toEqual({ sunAdaptation: 3, rainAdaptation: 2, windAdaptation: 5 });
  });

  it('三层上限使用用户确认的50／100／200，各项先取整再限新增', () => {
    for (const [floor, cap] of [[1, 50], [2, 100], [3, 200]]) {
      const config = normalRewardConfig('sunAdaptation', floor);
      const reward = calculateNonBossRewards(config, { hpLost: 10, maxHp: 10 }, { ...zeroAttributes(), sunAdaptation: cap - 1 });
      expect(config.attributeCap).toBe(cap); expect(reward.scaledAttributes.sunAdaptation).toBe(5);
      expect(reward.gainedAttributes.sunAdaptation).toBe(1); expect(reward.overflowAttributes.sunAdaptation).toBe(4);
      expect(reward.attributesAfter.sunAdaptation).toBe(cap); expect(reward.gold).toBe(20);
    }
  });

  it('接近上限的实际战斗只获得1点，溢出4点不转为金币', () => {
    const s = finishFixture('scoreCap');
    expect(s.gold).toBe(20); expect(s.attributes.sunAdaptation).toBe(50);
    expect(s.reward).toMatchObject({ gainedAttributes: { sunAdaptation: 1 }, overflowAttributes: { sunAdaptation: 4 } });
  });

  it('已达上限不再增长，开发预设已超限时不暗中削减旧属性', () => {
    const config = normalRewardConfig('sunAdaptation');
    for (const current of [50, 60]) {
      const reward = calculateNonBossRewards(config, { hpLost: 1, maxHp: 1 }, { ...zeroAttributes(), sunAdaptation: current });
      expect(reward.gainedAttributes.sunAdaptation).toBe(0); expect(reward.attributesAfter.sunAdaptation).toBe(current);
    }
  });

  it('基准为0仍奖励0，0%评分卡牌三选一资格仍与100%相同', () => {
    const config = normalRewardConfig('sunAdaptation'); config.baseGold = 0; config.baseAttributes = zeroAttributes();
    const zero = calculateNonBossRewards(config, { hpLost: 0, maxHp: 10 }, zeroAttributes());
    const full = calculateNonBossRewards(config, { hpLost: 10, maxHp: 10 }, zeroAttributes());
    expect(zero.gold).toBe(0); expect(zero.gainedAttributes).toEqual(zeroAttributes());
    expect(zero.cardOffer).toEqual({ choices: 3, picks: 1, canSkip: true }); expect(full.cardOffer).toEqual(zero.cardOffer);
  });

  it('失败即使评分100%也没有金币、属性或卡牌奖励资格', () => {
    const reward = calculateNonBossRewards(normalRewardConfig('sunAdaptation'), { hpLost: 10, maxHp: 10 }, zeroAttributes(), false);
    expect(reward).toMatchObject({ eligible: false, gold: 0, rewardRatio: 0, cardOffer: null });
    expect(reward.gainedAttributes).toEqual(zeroAttributes());
  });

  it('没有可计分目标不凭空发保底，输入超额损失只按100%奖励', () => {
    const config = normalRewardConfig('sunAdaptation');
    expect(calculateNonBossRewards(config, { hpLost: 0, maxHp: 0 }, zeroAttributes())).toMatchObject({ eligible: false, gold: 0 });
    expect(calculateNonBossRewards(config, { hpLost: 99, maxHp: 10 }, zeroAttributes()).gold).toBe(20);
  });

  it('拒绝非法基准、楼层和卡牌资格，配置及输入对象不被修改', () => {
    const config = normalRewardConfig('sunAdaptation'), before = structuredClone(config), attributes = zeroAttributes();
    calculateNonBossRewards(config, { hpLost: 1, maxHp: 3 }, attributes);
    expect(config).toEqual(before); expect(attributes).toEqual(zeroAttributes());
    expect(() => validateRewardConfig({ ...config, baseGold: -1 })).toThrow('非负');
    expect(() => validateRewardConfig({ ...config, floor: 0 })).toThrow('楼层');
    expect(() => validateRewardConfig({ ...config, cardOffer: { choices: 0, picks: 1, canSkip: true } })).toThrow('资格');
  });
});

describe('步骤6：结算时点、幂等和成长衔接', () => {
  it('最后击杀尚在收尾时不发奖，队列结束才一次性提交', () => {
    const s = createScenario('scoreFull'); damageEnemy(s, 1, 10);
    expect(s.status).toBe('playing'); expect(s.lastKillPending).toBe(true);
    grantBattleRewards(s); expect(s.reward).toBeNull(); expect(s.gold).toBe(0);
    processEvents(s); expect(s.status).toBe('won'); expect(s.gold).toBe(20); expect(s.reward?.eligible).toBe(true);
  });

  it('最后击杀触发致死优先判败，满评分也不发奖励', () => {
    const s = createScenario('scoreFull');
    registerListener(s, { key: 'fatal', name: 'fatal', kind: 'relic', listensTo: ['ENEMY_DIED'],
      effects: [{ type: 'loseHp', amount: 20 }], limit: { scope: 'unlimited' }, allowChain: true });
    const n = act(s, { type: 'play', cardId: 0, target: 1 });
    expect(n.status).toBe('lost'); expect(n.reward?.score.percent).toBe(100); expect(n.gold).toBe(0);
    expect(n.attributes).toEqual(zeroAttributes());
  });

  it('最后怪物接触消失正常结算，接触致死则不给20%保底', () => {
    expect(finishFixture('scoreZero').reward).toMatchObject({ eligible: true, gold: 4 });
    const defeat = finishFixture('scoreDefeat');
    expect(defeat.status).toBe('lost'); expect(defeat.gold).toBe(0); expect(defeat.reward?.eligible).toBe(false);
    expect(defeat.scoring[0].disposition).toBe('contact');
  });

  it('重复结束、发奖、渲染及事件处理不会重复领取或重复触发死亡', () => {
    const s = finishFixture('scoreFull'), before = structuredClone(s);
    grantBattleRewards(s); finishBattle(s, 'won', 'last-kill'); processEvents(s);
    result(s); result(s);
    expect(s).toEqual(before); expect(s.gold).toBe(20); expect(s.attributes.sunAdaptation).toBe(5);
    expect(s.eventHistory.filter(event => event.type === 'ENEMY_DIED')).toHaveLength(1);
  });

  it('Boss接触终止不错误套用非Boss保底公式', () => {
    const s = createScenario('scoreFull'); damageEnemy(s, 1, 10); finishBattle(s, 'won', 'boss-contact');
    expect(s.reward?.eligible).toBe(false); expect(s.gold).toBe(0); expect(s.attributes).toEqual(zeroAttributes());
  });

  it('金额溢出时不部分修改余额、属性或领取状态', () => {
    const s = createScenario('scoreFull'); s.status = 'won'; s.finishReason = 'last-kill'; s.scoring[0].hpLost = 10; s.gold = Number.MAX_SAFE_INTEGER;
    const before = structuredClone(s);
    expect(() => grantBattleRewards(s)).toThrow('安全整数'); expect(s).toEqual(before);
  });

  it('三个正常测试布局分别指定晴、雨、风奖励，基准与当前天气无关', () => {
    expect([0, 1, 2].map(index => createBattle(index).rewardConfig.baseAttributes))
      .toEqual([{ ...zeroAttributes(), sunAdaptation: 5 }, { ...zeroAttributes(), rainAdaptation: 5 }, { ...zeroAttributes(), windAdaptation: 5 }]);
  });

  it('继续战斗携带生命、金币、永久牌组与属性，恢复消耗牌并清空临时监听', () => {
    let s = createBattle(); s.player.hp = 12; s.deck[0].upgraded = true;
    registerListener(s, { key: 'relic', name: 'relic', kind: 'relic', listensTo: ['CARD_PLAYED'], effects: [], limit: { scope: 'battle', count: 1 }, allowChain: false });
    registerListener(s, { key: 'temp', name: 'temp', kind: 'temporary', snapshot: 'eventStart', listensTo: ['CARD_PLAYED'], effects: [], limit: { scope: 'battle', count: 1 }, allowChain: false });
    const id = s.hand.find(card => card.key === 'prepare')!.id;
    s = act(s, { type: 'play', cardId: id });
    damageEnemies(s, s.enemies.map(enemy => enemy.id), 100); processEvents(s);
    const before = structuredClone(s), next = continueBattle(s);
    expect(s).toEqual(before); expect(next.encounter).toBe(1); expect(next.seed).toBe(nextRandom(s.seed));
    expect(next.player.hp).toBe(12); expect(next.gold).toBe(20); expect(next.attributes.sunAdaptation).toBe(5);
    expect(next.deck).toEqual(s.deck); expect([...next.hand, ...next.draw]).toHaveLength(7); expect(next.exhaust).toEqual([]);
    expect(next.listeners).toHaveLength(1); expect(next.listeners[0].definition.key).toBe('relic'); expect(next.listeners[0].totalTriggers).toBe(0);
    expect(next.reward).toBeNull(); expect(next.scoring.every(record => record.hpLost === 0)).toBe(true);
  });

  it('进行中、失败或固定开发局面不能通过继续入口混入正式牌组', () => {
    expect(() => continueBattle(createBattle())).toThrow('不能继续');
    expect(() => continueBattle(finishFixture('scoreDefeat'))).toThrow('不能继续');
    expect(() => continueBattle(finishFixture('scoreFull'))).toThrow('不能继续');
  });

  it('初始化金币和生命校验，重复重建不修改传入配置', () => {
    const player = { hp: 10, maxHp: 20 }, config = normalRewardConfig('sunAdaptation');
    const s = createBattle(0, 157, undefined, [], { gold: 7, player, rewardConfig: config });
    player.hp = 1; config.baseGold = 1;
    expect(s.player.hp).toBe(10); expect(s.gold).toBe(7); expect(s.rewardConfig.baseGold).toBe(20);
    expect(() => createBattle(0, 157, undefined, [], { gold: -1 })).toThrow('金币');
    expect(() => createBattle(0, 157, undefined, [], { player: { hp: 0, maxHp: 20 } })).toThrow('生命');
  });

  it('JSON恢复保留计分与已发奖励，不因恢复再次发奖', () => {
    const s = finishFixture('scoreSeventyFive'), restored = JSON.parse(JSON.stringify(s));
    grantBattleRewards(restored); expect(restored).toEqual(s);
  });
});
