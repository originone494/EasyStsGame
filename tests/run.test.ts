import { describe, expect, it } from 'vitest';
import { generateMap, isBattleNode, floorBattleCounts } from '../src/game/map';
import { mapRules } from '../src/content/map';
import { acknowledgeRunReward, actInRun, createRun, currentNode, enterRunNode, leaveSafeNode, settleRunBattle } from '../src/game/run';
import type { RunState } from '../src/game/model';
import { damageEnemies, damagePlayer } from '../src/game/resolution';
import { processEvents } from '../src/game/eventQueue';
import { registerListener } from '../src/game/listeners';
import { createRunScenario } from '../src/game/runScenarios';
import { runMap, safeNodeScreen } from '../src/ui/map';
import { result } from '../src/ui/panels';
import { continueBattle } from '../src/game/progression';
import { nextRandom } from '../src/game/random';
import { scatterMapNodes } from '../src/ui/mapLayout';

function win(input: RunState): RunState {
  let run = input.runStatus === 'map' ? enterRunNode(input, currentNode(input).id) : input;
  damageEnemies(run.battle!, run.battle!.enemies.map(enemy => enemy.id), 100);
  processEvents(run.battle!); run = settleRunBattle(run);
  for (let i = 0; run.runStatus === 'battle' && i < 10; i++) run = actInRun(run, { type: 'endTurn' });
  expect(['reward', 'won']).toContain(run.runStatus); return run;
}

describe('步骤8：固定战斗骨架与随机安全节点', () => {
  it('100个种子的三层散点均不重叠、Boss最高、火堆在旁，同种子位置稳定', () => {
    let seed = 0;
    for (let sample = 0; sample < 100; sample++, seed = nextRandom(seed)) {
      const map = generateMap(seed, mapRules);
      for (const floor of [1, 2, 3]) for (const columns of [2, 3, 4] as const) {
        const nodes = map.filter(node => node.floor === floor), before = structuredClone(nodes);
        const layout = scatterMapNodes(nodes, seed, columns);
        expect(nodes).toEqual(before); expect(layout.points).toHaveLength(nodes.length);
        const width = { 2: 280, 3: 500, 4: 720 }[columns];
        const points = layout.points.map((point, index) => ({ x: 56 + point.x * (width - 112),
          y: nodes[index].kind === 'boss' ? 70 : 180 + point.y * (layout.minHeight - 245) }));
        const boss = points[nodes.findIndex(node => node.kind === 'boss')];
        const camp = points[nodes.findIndex(node => 'beforeBoss' in node && node.beforeBoss)];
        expect(camp.y - boss.y).toBeGreaterThan(100); expect(camp.y - boss.y).toBeLessThan(160);
        expect(Math.abs(camp.x - boss.x)).toBeLessThan(width * .2);
        for (let i = 0; i < points.length; i++) {
          if (nodes[i].kind !== 'boss') expect(points[i].y).toBeGreaterThan(boss.y);
          expect(points[i].x).toBeGreaterThanOrEqual(56); expect(points[i].x).toBeLessThanOrEqual(width - 56);
          for (let j = i + 1; j < points.length; j++) {
            expect(Math.abs(points[i].x - points[j].x) >= 96 || Math.abs(points[i].y - points[j].y) >= 108).toBe(true);
          }
        }
        if (sample === 0) expect(scatterMapNodes(nodes, seed, columns)).toEqual(layout);
      }
    }
  });

  it('每层10／7／5战、另有5随机安全节点和1固定火堆，全局40节点22战', () => {
    const nodes = generateMap(157, mapRules);
    expect(nodes).toHaveLength(40); expect(nodes.filter(isBattleNode)).toHaveLength(22);
    for (const floor of [1, 2, 3]) {
      const list = nodes.filter(node => node.floor === floor), safe = list.filter(node => !isBattleNode(node));
      expect(list.filter(isBattleNode)).toHaveLength(floorBattleCounts[floor - 1]); expect(safe).toHaveLength(6);
      const randomSafe = safe.filter(node => !isBattleNode(node) && !node.beforeBoss);
      expect(randomSafe).toHaveLength(5); expect(randomSafe.some(node => node.kind === 'shop')).toBe(true);
      expect(randomSafe.some(node => node.kind === 'campfire')).toBe(true);
      expect(list.at(-1)!.kind).toBe('boss'); expect(list.at(-2)).toMatchObject({ kind: 'campfire', beforeBoss: true });
    }
  });

  it('1000个固定种子均满足数量、ID唯一、编号连续及Boss前相邻关系', () => {
    let seed = 0;
    for (let i = 0; i < 1000; i++, seed = nextRandom(seed)) {
      const nodes = generateMap(seed, mapRules), battles = nodes.filter(isBattleNode);
      expect(nodes).toHaveLength(40); expect(new Set(nodes.map(node => node.id)).size).toBe(40);
      expect(battles.map(node => node.globalBattleIndex)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));
      for (const floor of [1, 2, 3]) {
        const list = nodes.filter(node => node.floor === floor), safe = list.filter(node => !isBattleNode(node));
        expect(safe).toHaveLength(6); expect(safe.filter(node => node.kind === 'campfire').length).toBeGreaterThanOrEqual(2);
        expect(safe.some(node => node.kind === 'shop')).toBe(true);
        expect(list.at(-2)).toMatchObject({ kind: 'campfire', beforeBoss: true }); expect(list.at(-1)!.kind).toBe('boss');
      }
    }
  });

  it('同种子地图、战斗种子和奖励完全复现，不同种子随机位置不同', () => {
    expect(generateMap(0, mapRules)).toEqual(generateMap(0, mapRules));
    expect(generateMap(157, mapRules)).not.toEqual(generateMap(158, mapRules));
    const before = structuredClone(mapRules); generateMap(157, mapRules); expect(mapRules).toEqual(before);
  });

  it('精英可替换非Boss名额，配置奖励与楼层上限进入节点但不增加战数', () => {
    const nodes = generateMap(42, { ...mapRules, elitesPerFloor: 1, eliteBaseGold: 40,
      eliteBaseAttributes: { sunAdaptation: 5, rainAdaptation: 5, windAdaptation: 5 } });
    expect(nodes.filter(isBattleNode)).toHaveLength(22); expect(nodes.filter(node => node.kind === 'elite')).toHaveLength(3);
    for (const node of nodes.filter(isBattleNode).filter(node => node.kind === 'elite')) {
      expect(node.rewardConfig.baseGold).toBe(40); expect(Object.values(node.rewardConfig.baseAttributes)).toEqual([5, 5, 5]);
      expect(node.rewardConfig.attributeCap).toBe([50, 100, 200][node.floor - 1]);
    }
  });

  it('特殊节点配置只改变安全节点总量，不改变22战与Boss相邻关系', () => {
    const nodes = generateMap(9, { ...mapRules, safeNodesPerFloor: 8 });
    expect(nodes.filter(isBattleNode)).toHaveLength(22); expect(nodes).toHaveLength(49);
    for (let i = 0; i < nodes.length; i++) if (nodes[i].kind === 'boss') expect(nodes[i - 1]).toMatchObject({ kind: 'campfire', beforeBoss: true });
  });

  it('额外名额仅生成事件时仍保留最低商店与随机火堆', () => {
    const nodes = generateMap(9, { ...mapRules, safeNodeWeights: { shop: 0, campfire: 0, event: 1 } });
    for (const floor of [1, 2, 3]) {
      const safe = nodes.filter(node => node.floor === floor && !isBattleNode(node));
      expect(safe.filter(node => node.kind === 'event')).toHaveLength(3);
      expect(safe.filter(node => node.kind === 'campfire')).toHaveLength(2);
      expect(safe.filter(node => node.kind === 'shop')).toHaveLength(1);
    }
  });

  it('拒绝非法种子、最低数量冲突、全零权重、非法精英数及基准', () => {
    expect(() => generateMap(-1, mapRules)).toThrow('种子');
    expect(() => generateMap(1, { ...mapRules, safeNodesPerFloor: 2, minimumShops: 2 })).toThrow('不足');
    expect(() => generateMap(1, { ...mapRules, minimumCampfires: 0 })).toThrow('火堆');
    expect(() => generateMap(1, { ...mapRules, safeNodeWeights: { shop: 0, campfire: 0, event: 0 } })).toThrow('全为0');
    expect(() => generateMap(1, { ...mapRules, elitesPerFloor: 5 })).toThrow('精英');
    expect(() => generateMap(1, { ...mapRules, eliteBaseGold: -1 })).toThrow('非负');
  });
});

describe('步骤8：单局资产、合法推进与终点', () => {
  it('开局独立登记七张牌组、队伍、生命、计费次数与空奖励，ID区分新局', () => {
    const run = createRun(157), other = createRun(157);
    expect(run.runId).not.toBe(other.runId); expect(run.mapNodes).toEqual(other.mapNodes);
    expect(run).toMatchObject({ currentFloor: 1, currentNodeIndex: 0, currentHP: 20, maxHP: 20, gold: 0,
      paidRemoveCount: 0, paidUpgradeCount: 0, pendingReward: null, runStatus: 'map', battle: null, completedNodes: [] });
    expect(run.deck).toHaveLength(7); expect(run.party).toEqual([{ id: 0, key: 'wanderer' }]);
  });

  it('同层可自由选点，跨层、未知节点、重复进入和战斗中跳转被拒绝且不改输入', () => {
    const run = createRun(157), before = structuredClone(run), id = currentNode(run).id;
    expect(enterRunNode(run, 'f1-b9').battle!.runContext!.nodeId).toBe('f1-b9');
    expect(() => enterRunNode(run, 'f2-b1')).toThrow('当前');
    expect(() => enterRunNode(run, 'missing')).toThrow('当前'); expect(run).toEqual(before);
    const battle = enterRunNode(run, id); expect(() => enterRunNode(battle, id)).toThrow('当前');
    expect(() => leaveSafeNode(battle, id)).toThrow('当前'); expect(() => acknowledgeRunReward(battle, id)).toThrow('当前');
    const done = acknowledgeRunReward(win(battle), id); expect(() => enterRunNode(done, id)).toThrow('当前');
  });

  it('乱序访问安全节点与战斗后仍可选择较早节点，每个节点只能完成一次', () => {
    let run = createRun(157);
    const camp = run.mapNodes.find(node => node.floor === 1 && node.kind === 'campfire')!;
    const safe = enterRunNode(run, camp.id);
    expect(currentNode(safe).id).toBe(camp.id); expect(safe.runStatus).toBe('safe');
    expect(() => enterRunNode(safe, 'f1-b1')).toThrow('当前');
    run = leaveSafeNode(safe, camp.id);
    expect(run.currentFloor).toBe(1); expect(run.completedNodes).toEqual([camp.id]);
    run = enterRunNode(run, 'f1-b9'); run = win(run);
    expect(() => enterRunNode(run, 'f1-b1')).toThrow('当前');
    expect(() => acknowledgeRunReward(run, 'f1-b1')).toThrow('当前');
    run = acknowledgeRunReward(run, 'f1-b9');
    expect(run.completedNodes).toEqual([camp.id, 'f1-b9']); expect(run.rewardHistory).toHaveLength(1);
    expect(enterRunNode(run, 'f1-b1').battle!.runContext!.nodeId).toBe('f1-b1');
    expect(() => enterRunNode(run, camp.id)).toThrow('当前');
    expect(() => enterRunNode(run, 'f1-b9')).toThrow('当前');
  });

  it('可直接挑战三层Boss，跳过节点不完成不发奖，胜利才升层且不能返回旧层', () => {
    let run = createRun(157);
    for (const floor of [1, 2, 3]) {
      const before = structuredClone(run), id = `f${floor}-boss`;
      run = enterRunNode(run, id);
      expect(run.currentFloor).toBe(floor); expect(currentNode(run).id).toBe(id);
      expect(run.battle!.boss).toBeDefined(); expect(before.completedNodes).toHaveLength(floor - 1);
      run = win(run);
      if (floor < 3) {
        expect(run.runStatus).toBe('reward'); expect(run.currentFloor).toBe(floor);
        run = acknowledgeRunReward(run, id);
        expect(run.currentFloor).toBe(floor + 1); expect(run.runStatus).toBe('map');
        expect(() => enterRunNode(run, `f${floor}-b1`)).toThrow('当前');
      } else {
        expect(run.runStatus).toBe('won'); expect(run.gold).toBe(before.gold);
        expect(run.attributes).toEqual(before.attributes);
      }
    }
    expect(run.completedNodes).toEqual(['f1-boss', 'f2-boss', 'f3-boss']);
    expect(run.rewardHistory.map(reward => reward.nodeId)).toEqual(['f1-boss', 'f2-boss']);
    expect(run.rewardHistory.reduce((sum, reward) => sum + reward.outcome.gold, 0)).toBe(run.gold);
    expect(() => enterRunNode(run, 'f3-b1')).toThrow('当前');
  });

  it('进入战斗携带资产和队伍，保留升级标记，初始化阶段即关联当前节点', () => {
    const run = createRun(157); run.currentHP = 12; run.maxHP = 25; run.gold = 7; run.attributes.sunAdaptation = 9;
    run.party.push({ id: 1, key: 'wanderer' }); run.deck[0].upgraded = true; run.paidRemoveCount = 3; run.paidUpgradeCount = 2;
    const before = structuredClone(run), next = enterRunNode(run, currentNode(run).id), battle = next.battle!;
    expect(run).toEqual(before); expect(battle.player).toMatchObject({ hp: 12, maxHp: 25 });
    expect(battle.gold).toBe(7); expect(battle.attributes.sunAdaptation).toBe(9); expect(battle.party).toEqual(run.party);
    expect(battle.deck).toEqual(run.deck); expect(battle.runContext).toEqual({ runId: run.runId, nodeId: currentNode(run).id });
    expect(next.paidRemoveCount).toBe(3); expect(next.paidUpgradeCount).toBe(2);
  });

  it('胜利只同步已发资产，结果确认不再发钱，重复确认不能跳过下一节点', () => {
    const pending = win(createRun(157)), gold = pending.gold, id = currentNode(pending).id;
    expect(pending.runStatus).toBe('reward'); expect(pending.pendingReward!.nodeId).toBe(id); expect(pending.completedNodes).toEqual([]);
    expect(settleRunBattle(pending)).toEqual(pending);
    const next = acknowledgeRunReward(pending, id);
    expect(next.gold).toBe(gold); expect(next.rewardHistory).toHaveLength(1); expect(next.completedNodes).toEqual([id]);
    expect(next.battle).toBeNull(); expect(next.pendingReward).toBeNull(); expect(() => acknowledgeRunReward(next, id)).toThrow('当前');
  });

  it('临时监听、牌区和次数不带到下一战，停用的已持有遗物仍保留', () => {
    let run = enterRunNode(createRun(157), 'f1-b1'), battle = run.battle!;
    const relic = registerListener(battle, { key: 'owned', name: 'owned', kind: 'relic', listensTo: ['CARD_PLAYED'], effects: [],
      limit: { scope: 'battle', count: 1 }, allowChain: false });
    battle.listeners.find(listener => listener.id === relic)!.active = false;
    registerListener(battle, { key: 'temp', name: 'temp', kind: 'temporary', snapshot: 'eventStart', listensTo: ['CARD_PLAYED'],
      effects: [], limit: { scope: 'unlimited' }, allowChain: false });
    const prepare = battle.hand.find(card => card.key === 'prepare');
    if (prepare) run = actInRun(run, { type: 'play', cardId: prepare.id });
    run = acknowledgeRunReward(win(run), currentNode(run).id);
    while (!isBattleNode(currentNode(run))) run = leaveSafeNode(enterRunNode(run, currentNode(run).id), currentNode(run).id);
    run = enterRunNode(run, currentNode(run).id); battle = run.battle!;
    expect(battle.listeners).toHaveLength(1); expect(battle.listeners[0]).toMatchObject({ active: true, totalTriggers: 0 });
    expect(battle.listeners[0].definition.key).toBe('owned'); expect(battle.exhaust).toEqual([]);
    expect(battle.hand.length + battle.draw.length).toBe(7); expect(battle.scoring.every(record => record.hpLost === 0)).toBe(true);
  });

  it('安全节点进入和离开只推进一次，不免费治疗、发钱或改变计费次数', () => {
    let run = createRun(157);
    while (isBattleNode(currentNode(run))) { const id = currentNode(run).id; run = acknowledgeRunReward(win(run), id); }
    run.currentHP = 8; run.paidUpgradeCount = 2; const id = currentNode(run).id, index = run.currentNodeIndex;
    const safe = enterRunNode(run, id), left = leaveSafeNode(safe, id);
    expect(safe.runStatus).toBe('safe'); expect(left.currentHP).toBe(8); expect(left.gold).toBe(run.gold);
    expect(left.deck).toEqual(run.deck); expect(left.attributes).toEqual(run.attributes); expect(left.paidUpgradeCount).toBe(2);
    expect(left.currentNodeIndex).toBe(index + 1); expect(() => leaveSafeNode(left, id)).toThrow('当前');
    expect(safeNodeScreen(safe)).toContain('继续前进');
  });

  it('普通战失败即本局失败，不标记完成，不允许重试或继续', () => {
    const run = enterRunNode(createRun(157), 'f1-b1'); damagePlayer(run.battle!, 999); const failed = settleRunBattle(run);
    expect(failed.runStatus).toBe('lost'); expect(failed.completedNodes).toEqual([]); expect(failed.pendingReward).toBeNull();
    expect(() => enterRunNode(failed, 'f1-b1')).toThrow('当前'); expect(() => actInRun(failed, { type: 'endTurn' })).toThrow('可操作');
    expect(result(failed.battle!, failed)).toContain('本局失败'); expect(result(failed.battle!, failed)).not.toContain('再战一次');
  });

  it('Boss未达标结束本局，不能进入第二层', () => {
    let run = enterRunNode(createRunScenario(157), 'f1-boss');
    for (let i = 0; run.runStatus === 'battle' && i < 10; i++) run = actInRun(run, { type: 'endTurn' });
    expect(run.runStatus).toBe('lost'); expect(run.currentFloor).toBe(1); expect(run.pendingReward).toBeNull();
    expect(run.completedNodes).not.toContain('f1-boss');
  });

  it('完整40节点、22战和3层推进，第三层通关无奖励、无第四层', () => {
    let run = createRun(157), count = 0; const caps: number[] = [], floorStarts: number[] = [];
    while (!['won', 'lost'].includes(run.runStatus) && count++ < 50) {
      const node = currentNode(run), beforeGold = run.gold;
      if (isBattleNode(node)) {
        if (node.battleIndex === 1) floorStarts.push(node.floor);
        caps.push(node.rewardConfig.attributeCap); run = win(run);
        if (run.runStatus === 'reward') run = acknowledgeRunReward(run, node.id);
        else { expect(node.kind).toBe('boss'); expect(node.floor).toBe(3); expect(run.gold).toBe(beforeGold); }
      } else run = leaveSafeNode(enterRunNode(run, node.id), node.id);
    }
    expect(count).toBe(40); expect(run.runStatus).toBe('won'); expect(run.completedNodes).toHaveLength(40);
    expect(floorStarts).toEqual([1, 2, 3]); expect(caps).toEqual([...Array(10).fill(50), ...Array(7).fill(100), ...Array(5).fill(200)]);
    expect(run.currentFloor).toBe(3); expect(run.currentNodeIndex).toBe(39); expect(run.pendingReward).toBeNull();
    expect(run.rewardHistory).toHaveLength(21); expect(run.rewardHistory.reduce((sum, record) => sum + record.outcome.gold, 0)).toBe(run.gold);
    expect(run.deck).toHaveLength(7); expect(run.relics).toEqual([]); expect(run.party).toHaveLength(1);
    expect(result(run.battle!, run)).toContain('通关成功'); expect(() => enterRunNode(run, currentNode(run).id)).toThrow('当前');
  });

  it('查看地图不改变资产、当前节点或战斗随机数', () => {
    const run = enterRunNode(createRun(157), 'f1-b1'), before = structuredClone(run);
    runMap(run);
    expect(run).toEqual(before); expect(runMap(run)).toContain('返回战斗');
  });

  it('拒绝外来战斗上下文，单局战斗不能通过旧继续接口脱离地图', () => {
    const run = enterRunNode(createRun(157), 'f1-b1'); run.battle!.runContext!.nodeId = 'f3-boss';
    expect(() => settleRunBattle(run)).toThrow('不属于');
    const pending = win(createRun(157)); expect(() => continueBattle(pending.battle!)).toThrow('不能继续');
  });

  it('JSON恢复保留节点、资产与待确认奖励，可继续而不重复领奖', () => {
    const pending = win(createRun(0)), restored = JSON.parse(JSON.stringify(pending));
    expect(settleRunBattle(restored)).toEqual(pending);
    const next = acknowledgeRunReward(restored, currentNode(restored).id);
    expect(next.gold).toBe(pending.gold); expect(next.rewardHistory).toHaveLength(1);
    expect(pending.runStatus).toBe('reward');
  });
});
