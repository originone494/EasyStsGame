import { describe, expect, it, vi } from 'vitest';
import { planPushes, resolvePushBatch } from '../src/game/push';
import { pushEnemy, pushEnemies } from '../src/game/movement';
import { createScenario } from '../src/game/scenarios';
import { act } from '../src/game/actions';
import { registerListener } from '../src/game/listeners';
import { processEvents } from '../src/game/eventQueue';
import * as events from '../src/game/events';
import { nextRandom } from '../src/game/random';
import type { PushRequest } from '../src/game/model';

const request = (id: number, amount: number, direction: -1 | 1): PushRequest => ({ id, amount, direction });
const solve = (positions: number[], requests: PushRequest[], player = 1) => planPushes(13, player, positions.map((position, index) => ({ id: index + 1, position })), requests);
const destinations = (plan: ReturnType<typeof solve>) => plan.units.map(unit => unit.to);
function checkInvariant(plan: ReturnType<typeof solve>, size: number, player: number) {
  expect(plan.initial).toBe(plan.moved + plan.canceled + plan.boundaryLost + plan.playerBlocked + plan.remaining);
  expect(plan.remaining).toBe(0);
  for (const frame of plan.frames) {
    const positions = frame.positions.map(unit => unit.position);
    expect(new Set([player, ...positions]).size).toBe(positions.length + 1);
    expect(positions.every(position => Number.isInteger(position) && position >= 0 && position < size)).toBe(true);
  }
}

describe('步骤4：同步击退与冲突求解', () => {
  it('同向撞击将A剩余2和B自身剩余1累加，A停止且B移动3', () => {
    const plan = solve([8, 9], [request(1, 2, 1), request(2, 1, 1)], 6);
    expect(destinations(plan)).toEqual([8, 12]);
    expect(plan).toMatchObject({ initial: 3, moved: 3, canceled: 0, boundaryLost: 0 });
  });

  it('两个相邻目标一起击退时先传递，再移动，不借用本拍将腾空的位置', () => {
    const plan = solve([8, 9], [request(1, 2, 1), request(2, 2, 1)], 6);
    expect(destinations(plan)).toEqual([8, 12]);
    expect(plan).toMatchObject({ initial: 4, moved: 3, boundaryLost: 1 });
  });

  it('连续同向接触合并传入量，同一边同一拍不重复制造碰撞触发', () => {
    const plan = solve([8, 9, 10], [request(1, 2, 1), request(2, 1, 1)], 6);
    expect(destinations(plan)).toEqual([8, 9, 12]);
    expect(plan.frames[0].collisions.map(collision => [collision.actor, collision.target, collision.amount])).toEqual([[1, 2, 2], [2, 3, 3]]);
    expect(plan).toMatchObject({ initial: 3, moved: 2, boundaryLost: 1 });
  });

  it('非目标也会接收传递，单体连续链仍保持原有结果', () => {
    const plan = solve([9, 10, 11], [request(1, 7, 1)], 6);
    expect(destinations(plan)).toEqual([9, 10, 12]);
    expect(plan).toMatchObject({ initial: 7, moved: 1, boundaryLost: 6 });
    expect(plan.frames.flatMap(frame => frame.collisions)).toHaveLength(2);
  });

  it('双侧独立目标同步向外移动，不碰撞或损失位移', () => {
    const plan = solve([3, 9], [request(1, 2, -1), request(2, 2, 1)], 6);
    expect(destinations(plan)).toEqual([1, 11]);
    expect(plan).toMatchObject({ initial: 4, moved: 4, canceled: 0 });
    expect(plan.frames.flatMap(frame => frame.collisions)).toEqual([]);
  });

  it('同向保持间隔的目标可同时移动，不产生虚假碰撞', () => {
    const plan = solve([8, 10], [request(1, 2, 1), request(2, 2, 1)], 6);
    expect(destinations(plan)).toEqual([10, 12]);
    expect(plan.frames.flatMap(frame => frame.collisions)).toEqual([]);
  });

  it('已经移动的格数不再次传递，只传递追上目标时的剩余1格', () => {
    const plan = solve([8, 10], [request(1, 3, 1), request(2, 1, 1)], 6);
    expect(destinations(plan)).toEqual([10, 12]);
    expect(plan.frames.flatMap(frame => frame.collisions).map(collision => collision.amount)).toEqual([1]);
    expect(plan.moved).toBe(4);
  });

  it('相邻等量迎面冲突抵消双方位移，不交换位置或方向', () => {
    const plan = solve([5, 6], [request(1, 2, 1), request(2, 2, -1)]);
    expect(destinations(plan)).toEqual([5, 6]);
    expect(plan).toMatchObject({ initial: 4, moved: 0, canceled: 4 });
    expect(plan.frames[0].collisions[0]).toMatchObject({ mode: 'opposed', position: 5.5, canceled: 4 });
  });

  it('相邻反向冲突保留右向净余，施加给右边被推动单位', () => {
    const plan = solve([5, 6], [request(1, 3, 1), request(2, 1, -1)]);
    expect(destinations(plan)).toEqual([5, 8]);
    expect(plan).toMatchObject({ initial: 4, moved: 2, canceled: 2 });
  });

  it('相邻反向冲突保留左向净余，处理左右对称', () => {
    const plan = solve([5, 6], [request(1, 1, 1), request(2, 3, -1)]);
    expect(destinations(plan)).toEqual([3, 6]);
    expect(plan).toMatchObject({ initial: 4, moved: 2, canceled: 2 });
  });

  it('同拍等量争用空格时双方停止，不重叠', () => {
    const plan = solve([5, 7], [request(1, 2, 1), request(2, 2, -1)]);
    expect(destinations(plan)).toEqual([5, 7]);
    expect(plan.frames[0].collisions[0]).toMatchObject({ mode: 'converge', position: 6, canceled: 4 });
  });

  it('争用空格后较大一方继续，以后的碰撞只传递净余', () => {
    const plan = solve([5, 7], [request(1, 3, 1), request(2, 1, -1)]);
    expect(destinations(plan)).toEqual([6, 8]);
    expect(plan).toMatchObject({ initial: 4, moved: 2, canceled: 2 });
    expect(plan.frames.flatMap(frame => frame.collisions).map(collision => [collision.mode, collision.amount])).toEqual([['converge', 4], ['transfer', 1]]);
  });

  it('双侧同时撞向静止单位，在同一位置抵消并按参与者编号排序', () => {
    const plan = solve([4, 5, 6], [request(3, 2, -1), request(1, 2, 1)]);
    expect(destinations(plan)).toEqual([4, 5, 6]);
    expect(plan).toMatchObject({ moved: 0, canceled: 4 });
    expect(plan.frames[0].collisions.map(collision => [collision.position, collision.actor, collision.target])).toEqual([[5, 1, 2], [5, 3, 2]]);
  });

  it('多重冲突中的新输入与迎面净余同步合并，不复用被抵消的量', () => {
    const plan = solve([4, 5, 6], [request(1, 2, 1), request(2, 1, 1), request(3, 5, -1)]);
    expect(destinations(plan)).toEqual([2, 5, 6]);
    expect(plan).toMatchObject({ initial: 8, moved: 2, canceled: 6 });
    checkInvariant(plan, 13, 1);
  });

  it('左右边界立即清除剩余量，不自动记录撞墙碰撞', () => {
    const plan = solve([0, 12], [request(1, 5, -1), request(2, 7, 1)], 6);
    expect(destinations(plan)).toEqual([0, 12]);
    expect(plan).toMatchObject({ initial: 12, moved: 0, boundaryLost: 12 });
    expect(plan.frames.flatMap(frame => frame.collisions)).toEqual([]);
  });

  it('朝队伍强制位移按公开规格阻挡，不新增接触伤害', () => {
    const s = createScenario('pushTogether');
    s.enemies = [{ ...s.enemies[0], position: 7 }];
    const result = pushEnemy(s, 1, 4, 'toward');
    expect(result).toMatchObject({ initial: 4, moved: 0, playerBlocked: 4 });
    expect(s.enemies[0].position).toBe(7); expect(s.player.hp).toBe(20);
    expect(s.eventHistory).toEqual([]);
  });

  it('碰撞按同拍位置从左到右入队，左向传播也不依赖遍历方向', () => {
    const plan = solve([2, 3, 4, 9, 10], [request(3, 2, -1), request(4, 1, 1)], 6);
    const positions = plan.frames[0].collisions.map(collision => collision.position);
    expect(positions).toEqual([2, 3, 10]);
  });

  it('请求与单位数组重排后，完整逐拍计划和位移账本完全相同', () => {
    const units = [{ id: 4, position: 4 }, { id: 1, position: 5 }, { id: 8, position: 6 }, { id: 2, position: 10 }];
    const requests = [request(4, 2, 1), request(1, 1, 1), request(8, 5, -1), request(2, 2, 1)];
    expect(planPushes(13, 1, units, requests)).toEqual(planPushes(13, 1, [...units].reverse(), [...requests].reverse()));
  });

  it('大量位移在边界丢弃，正常移动距离不随输入量无意义循环', () => {
    const plan = solve([8, 9], [request(1, 1_000_000, 1), request(2, 1_000_000, 1)], 6);
    expect(destinations(plan)).toEqual([8, 12]);
    expect(plan).toMatchObject({ initial: 2_000_000, moved: 3, boundaryLost: 1_999_997 });
    expect(plan.frames).toHaveLength(4);
  });
});

describe('步骤4：事件接入、回归和守恒检查', () => {
  it('单体入口继续保留原碰撞事实形状和剩余量传递结果', () => {
    const s = createScenario('chain'); pushEnemy(s, 1, 2);
    expect(s.enemies.map(unit => unit.position)).toEqual([8, 11]);
    expect(s.events.filter(event => event.type === 'collision')).toEqual([{ type: 'collision', actor: 1, target: 2, amount: 2 }]);
    expect(s.eventHistory.find(event => event.type === 'COLLISION')?.push).toMatchObject({ batchId: 1, tick: 1, mode: 'transfer', position: 9 });
  });

  it('群体卡牌同步执行，碰撞本身不伤血、不生成伤害或接触事件', () => {
    const s = createScenario('pushTogether');
    const n = act(s, { type: 'play', cardId: 0 });
    expect(n.enemies.map(unit => [unit.position, unit.hp])).toEqual([[8, 6], [12, 10]]);
    expect(n.player.hp).toBe(20); expect(n.phase).toBe('player');
    expect(n.eventHistory.every(event => ['CARD_PLAYED', 'COLLISION', 'UNIT_MOVED'].includes(event.type))).toBe(true);
    expect(s.enemies.map(unit => unit.position)).toEqual([8, 9]);
    expect(n.pushHistory[0]).toMatchObject({ initial: 4, moved: 3, boundaryLost: 1 });
  });

  it('第一条本拍事件记录前已提交该拍所有单位位置', () => {
    const s = createScenario('pushSplit');
    const original = events.recordEvent;
    const observed: number[][] = [];
    const spy = vi.spyOn(events, 'recordEvent').mockImplementation((state, type, data, legacy) => {
      if (data?.push?.tick === 1) observed.push(state.enemies.map(unit => unit.position));
      return original(state, type, data, legacy);
    });
    try { pushEnemies(s, [1, 2], 2); } finally { spy.mockRestore(); }
    expect(observed).toEqual([[2, 10], [2, 10]]);
  });

  it('同坐标两个实际碰撞独立触发遗物，合并传播不会重复触发', () => {
    const n = act(createScenario('pushSandwich'), { type: 'play', cardId: 0 });
    expect(n.player.hp).toBe(9); expect(n.listeners[0].totalTriggers).toBe(2);
    expect(n.eventHistory.filter(event => event.type === 'COLLISION').map(event => event.actor?.id)).toEqual([1, 3]);
    expect(n.pushHistory[0]).toMatchObject({ initial: 4, moved: 0, canceled: 4 });
  });

  it('监听可区分普通传递、迎面冲突和同格争用', () => {
    const s = createScenario('pushOpposed');
    for (const mode of ['transfer', 'opposed', 'converge'] as const) registerListener(s, {
      key: mode, name: mode, kind: 'relic', listensTo: ['COLLISION'], condition: { type: 'collisionMode', mode },
      effects: [], limit: { scope: 'unlimited' }, allowChain: false,
    });
    const n = act(s, { type: 'play', cardId: 0 });
    expect(n.listeners.map(listener => listener.totalTriggers)).toEqual([1, 0, 1]);
  });

  it('碰撞监听在完整直接位移后响应，沿用父事件、来源和伤害分类', () => {
    const s = createScenario('pushTogether'); s.enemies[1].hp = 2;
    registerListener(s, { key: 'collision-damage', name: 'collision-damage', kind: 'relic', listensTo: ['COLLISION'],
      effects: [{ type: 'damage', target: 'eventTarget', amount: 3 }], limit: { scope: 'unlimited' }, allowChain: false });
    const n = act(s, { type: 'play', cardId: 0 });
    const collision = n.eventHistory.find(event => event.type === 'COLLISION')!;
    const damage = n.eventHistory.find(event => event.type === 'DAMAGE_RESOLVED')!;
    expect(damage).toMatchObject({ parentId: collision.id, source: { kind: 'relic' }, damage: { kind: 'relic', hpBefore: 2 } });
    expect(n.enemies.map(unit => [unit.id, unit.position])).toEqual([[1, 8]]);
    expect(n.pushHistory[0].moved).toBe(3);
  });

  it('碰撞监听致死立即取消后续队列，已完成位置不回滚', () => {
    const s = createScenario('pushSandwich'); s.player.hp = 1;
    s.listeners = [];
    registerListener(s, { key: 'fatal', name: 'fatal', kind: 'relic', listensTo: ['COLLISION'],
      effects: [{ type: 'loseHp', amount: 1 }, { type: 'heal', amount: 10 }], limit: { scope: 'unlimited' }, allowChain: true });
    const n = act(s, { type: 'play', cardId: 0 });
    expect(n.status).toBe('lost'); expect(n.player.hp).toBe(0); expect(n.eventQueue).toEqual([]);
    expect(n.listeners[0].totalTriggers).toBe(1); expect(n.pushHistory).toHaveLength(1);
    expect(n.enemies.map(unit => unit.position)).toEqual([4, 5, 6]);
  });

  it('遗物群体位移从执行时当前位置锁定新批次，来源和批次独立', () => {
    const s = createScenario('pushSplit');
    registerListener(s, { key: 'push-again', name: 'push-again', kind: 'relic', listensTo: ['CARD_PLAYED'],
      effects: [{ type: 'pushAll', amount: 1 }], limit: { scope: 'unlimited' }, allowChain: false });
    const n = act(s, { type: 'play', cardId: 0 });
    expect(n.enemies.map(unit => unit.position)).toEqual([0, 12]);
    expect(n.pushHistory.map(batch => [batch.batchId, batch.initial, batch.moved])).toEqual([[1, 4, 4], [2, 2, 2]]);
    expect(n.eventHistory.filter(event => event.source.kind === 'relic').every(event => event.push?.batchId === 2)).toBe(true);
  });

  it('群体监听的目标生命相关数值独立锁定，支持不同目标位移量', () => {
    const s = createScenario('pushSplit');
    registerListener(s, { key: 'scaled-push', name: 'scaled-push', kind: 'relic', listensTo: ['HEALED'],
      effects: [{ type: 'pushAll', amount: { targetHp: 0.3 } }], limit: { scope: 'unlimited' }, allowChain: false });
    events.recordEvent(s, 'HEALED'); processEvents(s);
    expect(s.enemies.map(unit => unit.position)).toEqual([1, 12]);
    expect(s.pushHistory[0]).toMatchObject({ initial: 5, moved: 5 });
  });

  it('原始明确方向群体也可由监听配置执行', () => {
    const s = createScenario('pushOpposed');
    registerListener(s, { key: 'fixed-push', name: 'fixed-push', kind: 'relic', listensTo: ['HEALED'],
      effects: [{ type: 'pushGroup', pushes: [request(1, 3, 1), request(2, 1, -1)] }], limit: { scope: 'unlimited' }, allowChain: false });
    events.recordEvent(s, 'HEALED'); processEvents(s);
    expect(s.enemies.map(unit => unit.position)).toEqual([6, 8]);
  });

  it('空集合、未知目标、零位移不产生批次或事件', () => {
    const s = createScenario('pushSplit');
    resolvePushBatch(s, []); resolvePushBatch(s, [request(999, 2, 1)]); pushEnemies(s, [1, 2], 0);
    expect(s.eventHistory).toEqual([]); expect(s.pushHistory).toEqual([]); expect(s.nextPushBatchId).toBe(1);
  });

  it('集合入口重复ID去重，原始重复请求及非法量在写入前报错', () => {
    const s = createScenario('pushSplit');
    const before = structuredClone(s);
    expect(() => resolvePushBatch(s, [request(1, 2, 1), request(1, 1, 1)])).toThrow('重复');
    expect(() => resolvePushBatch(s, [request(1, 2, 1), request(2, NaN, -1)])).toThrow('安全整数');
    expect(() => resolvePushBatch(s, [request(1, 0.5, 1)])).toThrow('安全整数');
    expect(() => resolvePushBatch(s, [request(1, -1, 1)])).toThrow('安全整数');
    expect(s).toEqual(before);
    const result = pushEnemies(s, [1, 1], 2);
    expect(result?.initial).toBe(2);
  });

  it('无效布局与超安全整数总量在写入前报错', () => {
    expect(() => planPushes(13, 1, [{ id: 1, position: 5 }, { id: 2, position: 5 }], [])).toThrow('重叠');
    expect(() => solve([5, 6], [request(1, Number.MAX_SAFE_INTEGER, 1), request(2, 1, 1)])).toThrow('精确表示');
  });

  it('胜负终止后不再移动或记录新批次', () => {
    const s = createScenario('pushSplit'); events.finishBattle(s, 'lost', 'player-death');
    const before = structuredClone(s);
    pushEnemy(s, 1, 2); resolvePushBatch(s, [request(2, 2, 1)]);
    expect(s).toEqual(before);
  });

  it('同种子动作回放和JSON恢复保留相同位置、事件及账本', () => {
    const s = createScenario('pushOpposed');
    const restored = JSON.parse(JSON.stringify(s));
    expect(act(s, { type: 'play', cardId: 0 })).toEqual(act(restored, { type: 'play', cardId: 0 }));
    const n = act(s, { type: 'play', cardId: 0 });
    expect(JSON.parse(JSON.stringify(n))).toEqual(n);
  });

  it('穷举2500种三单位小战场输入，每拍不越界、不重叠且位移守恒', () => {
    const cells = [0, 1, 2, 4, 5, 6];
    let cases = 0;
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) for (let c = b + 1; c < cells.length; c++) {
      const units = [a, b, c].map((index, i) => ({ id: i + 1, position: cells[index] }));
      for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
        const requests = [x, y, z].map((value, i) => request(i + 1, Math.abs(value), value < 0 ? -1 : 1));
        const plan = planPushes(7, 3, units, requests);
        checkInvariant(plan, 7, 3); cases++;
      }
    }
    expect(cases).toBe(2500);
  });

  it('1000个固定种子多重冲突布局重排后完整计划一致，位移持续守恒', () => {
    let seed = 157;
    const random = (limit: number) => { seed = nextRandom(seed); return Math.floor(seed / 4294967296 * limit); };
    for (let sample = 0; sample < 1000; sample++) {
      const count = 1 + random(5), cells = [0, 1, 2, 3, 5, 6, 7, 8];
      const units = Array.from({ length: count }, (_, i) => ({ id: i + 1, position: cells.splice(random(cells.length), 1)[0] }));
      const requests = units.map(unit => request(unit.id, random(5), random(2) ? 1 : -1));
      const plan = planPushes(9, 4, units, requests);
      checkInvariant(plan, 9, 4);
      expect(plan).toEqual(planPushes(9, 4, [...units].reverse(), [...requests].reverse()));
    }
  });
});
