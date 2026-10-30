import type { BattleState, MapGenerationConfig, MapNode, RunState } from './model';
import { createBattle, createBossBattle } from './state';
import { generateMap, isBattleNode } from './map';
import { prototype } from '../content/encounters';
import { createDeck } from './deck';
import { getStartingDeck } from '../content/cards';
import { zeroAttributes } from '../content/economy';
import { act, type Action } from './actions';
import { mapRules } from '../content/map';

export function createRun(seed: number, config: MapGenerationConfig = mapRules): RunState {
  return { runId: crypto.randomUUID(), seed, scenario: '', currentFloor: 1, currentNodeIndex: 0,
    party: [{ id: 0, key: prototype.character }], currentHP: prototype.maxHp, maxHP: prototype.maxHp,
    deck: createDeck(getStartingDeck(prototype.character)), relics: [], gold: 0, attributes: zeroAttributes(),
    mapNodes: generateMap(seed, config), completedNodes: [], paidRemoveCount: 0, paidUpgradeCount: 0,
    pendingReward: null, rewardHistory: [], runStatus: 'map', battle: null };
}

export function currentNode(run: RunState): MapNode {
  const node = run.mapNodes[run.currentNodeIndex];
  if (!node || node.floor !== run.currentFloor) throw new Error('单局当前节点无效。');
  return node;
}

function assertCurrent(run: RunState, nodeId: string, status: RunState['runStatus']) {
  if (run.runStatus !== status || run.currentHP <= 0 || currentNode(run).id !== nodeId
    || run.completedNodes.includes(nodeId)) throw new Error('只能处理当前未完成节点。');
}

function synchronizeAssets(run: RunState, battle: BattleState) {
  run.currentHP = battle.player.hp; run.maxHP = battle.player.maxHp;
  run.gold = battle.gold; run.attributes = { ...battle.attributes }; run.deck = structuredClone(battle.deck);
  run.party = structuredClone(battle.party);
  // Relic ownership survives per-battle disable/count state. Temporary listeners
  // and battle counters never become permanent run assets.
  run.relics = battle.listeners.filter(listener => listener.definition.kind === 'relic')
    .sort((a, b) => a.order - b.order).map(listener => structuredClone(listener.definition));
}

export function enterRunNode(input: RunState, nodeId: string): RunState {
  assertCurrent(input, nodeId, 'map');
  const run = structuredClone(input), node = currentNode(run);
  if (!isBattleNode(node)) { run.runStatus = 'safe'; return run; }
  const options = { attributes: run.attributes, gold: run.gold, player: { hp: run.currentHP, maxHp: run.maxHP },
    party: run.party, rewardConfig: node.rewardConfig, runContext: { runId: run.runId, nodeId: node.id } };
  run.battle = node.kind === 'boss' ? createBossBattle(node.floor, node.seed, run.deck, run.relics, options)
    : createBattle(node.encounter, node.seed, run.deck, run.relics, options);
  run.battle.scenario = run.scenario;
  run.runStatus = 'battle';
  return settleRunBattle(run);
}

export function settleRunBattle(input: RunState): RunState {
  const run = structuredClone(input);
  if (run.runStatus !== 'battle') return run;
  const node = currentNode(run), battle = run.battle;
  if (!isBattleNode(node) || !battle || battle.runContext?.runId !== run.runId || battle.runContext.nodeId !== node.id
    || Boolean(battle.boss) !== (node.kind === 'boss')) throw new Error('战斗不属于当前单局节点。');
  synchronizeAssets(run, battle);
  if (battle.status === 'playing') return run;
  if (battle.status === 'lost') { run.runStatus = 'lost'; run.pendingReward = null; return run; }
  if (!battle.reward) throw new Error('战斗尚未完成奖励结算。');
  if (node.kind === 'boss' && node.floor === 3) {
    run.completedNodes.push(node.id); run.runStatus = 'won'; run.pendingReward = null; return run;
  }
  run.pendingReward = { nodeId: node.id, outcome: structuredClone(battle.reward) };
  run.runStatus = 'reward';
  return run;
}

export function actInRun(input: RunState, action: Action): RunState {
  if (input.runStatus !== 'battle' || !input.battle || input.battle.status !== 'playing') throw new Error('当前不在可操作的单局战斗中。');
  const run = structuredClone(input);
  run.battle = act(run.battle!, action);
  return settleRunBattle(run);
}

function advance(run: RunState) {
  const node = currentNode(run), next = run.mapNodes[run.currentNodeIndex + 1];
  if (!next) throw new Error('终点只能由第三层Boss通关处理。');
  run.completedNodes.push(node.id); run.currentNodeIndex++; run.currentFloor = next.floor;
  run.battle = null; run.pendingReward = null; run.runStatus = 'map';
}

export function acknowledgeRunReward(input: RunState, nodeId: string): RunState {
  assertCurrent(input, nodeId, 'reward');
  if (input.pendingReward?.nodeId !== nodeId) throw new Error('当前没有待确认的战斗结果。');
  const run = structuredClone(input);
  // Gold/adaptations were already granted by the battle. Preserve deferred
  // card/relic entitlements in history for step 9; never fabricate owned items.
  run.rewardHistory.push(structuredClone(run.pendingReward!)); advance(run);
  return run;
}

export function leaveSafeNode(input: RunState, nodeId: string): RunState {
  assertCurrent(input, nodeId, 'safe');
  if (isBattleNode(currentNode(input))) throw new Error('战斗节点不能作为安全节点跳过。');
  const run = structuredClone(input); advance(run); return run;
}
