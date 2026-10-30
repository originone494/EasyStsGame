import type { BattleState, MapGenerationConfig, MapNode, RunState } from './model';
import { createBattle, createBossBattle } from './state';
import { generateMap, isBattleNode } from './map';
import { prototype } from '../content/encounters';
import { createDeck } from './deck';
import { basicStartingCards, getStartingDeck } from '../content/cards';
import { zeroAttributes } from '../content/economy';
import { act, type Action } from './actions';
import { mapRules } from '../content/map';
import { liveProgression } from '../content/progression';
import { acquireCard, cardCandidates, characterPool, fixedRelic, offerSeed, recruitmentCandidates, relicCandidate, validateProgressionContent, type ProgressionContent } from './selection';
import { generateCardOffer } from './offers';

export function createRun(seed: number, config: MapGenerationConfig = mapRules, content: ProgressionContent | null = liveProgression): RunState {
  if (content) validateProgressionContent(content);
  const initialCharacter = content?.initialCharacter ?? prototype.character;
  const deck = createDeck(content ? [...basicStartingCards, ...content.characters[initialCharacter].startingCards] : getStartingDeck(initialCharacter));
  return { runId: crypto.randomUUID(), seed, scenario: '', currentFloor: 1, currentNodeIndex: 0,
    progressionId: content?.id ?? null, nextCardId: deck.length,
    party: [{ id: 0, key: initialCharacter }], currentHP: prototype.maxHp, maxHP: prototype.maxHp,
    deck, relics: content ? [fixedRelic(content, initialCharacter)] : [], gold: 0, attributes: zeroAttributes(),
    mapNodes: generateMap(seed, config), completedNodes: [], paidRemoveCount: 0, paidUpgradeCount: 0,
    pendingReward: null, rewardHistory: [], pendingRecruitment: null, recruitmentHistory: [], runStatus: 'map', battle: null };
}

function checkContent(run: RunState, content: ProgressionContent | null) {
  if (run.progressionId !== (content?.id ?? null)) throw new Error('单局奖励内容配置不一致。');
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

export function canEnterRunNode(run: RunState, nodeId: string): boolean {
  return run.runStatus === 'map' && run.currentHP > 0 && !run.completedNodes.includes(nodeId)
    && run.mapNodes.some(node => node.id === nodeId && node.floor === run.currentFloor);
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

export function enterRunNode(input: RunState, nodeId: string, content: ProgressionContent | null = liveProgression): RunState {
  checkContent(input, content);
  if (!canEnterRunNode(input, nodeId)) throw new Error('只能进入当前楼层未完成的节点。');
  const run = structuredClone(input);
  run.currentNodeIndex = run.mapNodes.findIndex(node => node.id === nodeId);
  const node = currentNode(run);
  if (!isBattleNode(node)) { run.runStatus = 'safe'; return run; }
  const options = { attributes: run.attributes, gold: run.gold, player: { hp: run.currentHP, maxHp: run.maxHP },
    party: run.party, rewardConfig: node.rewardConfig, runContext: { runId: run.runId, nodeId: node.id } };
  run.battle = node.kind === 'boss' ? createBossBattle(node.floor, node.seed, run.deck, run.relics, options)
    : createBattle(node.encounter, node.seed, run.deck, run.relics, options);
  run.battle.scenario = run.scenario;
  run.runStatus = 'battle';
  return settleRunBattle(run, content);
}

export function settleRunBattle(input: RunState, content: ProgressionContent | null = liveProgression): RunState {
  checkContent(input, content);
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
  if (content) {
    const candidates = battle.reward.cardOffer ? cardCandidates(content, run.party, run.deck,
      offerSeed(node.seed, 'battle-card'), battle.reward.cardOffer.rarity === 'rare') : [];
    run.pendingReward.cardSelection = { candidates, status: candidates.length ? 'pending' : 'empty', picked: null };
    const relic = battle.reward.relicOffer ? relicCandidate(content, run.relics,
      battle.reward.relicOffer.rarity, offerSeed(node.seed, 'boss-relic')) : null;
    run.pendingReward.relicKey = relic;
    if (relic) run.relics.push(structuredClone(content.relics[relic].listener));
  }
  run.runStatus = 'reward';
  return run;
}

export function actInRun(input: RunState, action: Action, content: ProgressionContent | null = liveProgression): RunState {
  checkContent(input, content);
  if (input.runStatus !== 'battle' || !input.battle || input.battle.status !== 'playing') throw new Error('当前不在可操作的单局战斗中。');
  const run = structuredClone(input);
  run.battle = act(run.battle!, action);
  return settleRunBattle(run, content);
}

function advance(run: RunState) {
  const node = currentNode(run);
  run.completedNodes.push(node.id);
  // Only defeating the floor's Boss changes floors. Skipped nodes are neither
  // completed nor rewarded; ordinary visits always return to free selection.
  if (node.kind === 'boss') run.currentFloor++;
  const next = run.mapNodes.findIndex(candidate => candidate.floor === run.currentFloor
    && !run.completedNodes.includes(candidate.id));
  if (next < 0) throw new Error('当前楼层没有可用节点。');
  run.currentNodeIndex = next;
  run.battle = null; run.pendingReward = null; run.pendingRecruitment = null; run.runStatus = 'map';
}

export function acknowledgeRunReward(input: RunState, nodeId: string, content: ProgressionContent | null = liveProgression): RunState {
  checkContent(input, content);
  assertCurrent(input, nodeId, 'reward');
  if (input.pendingReward?.nodeId !== nodeId) throw new Error('当前没有待确认的战斗结果。');
  if (input.pendingReward.cardSelection?.status === 'pending') throw new Error('请先选卡或跳过卡牌奖励。');
  const run = structuredClone(input);
  run.rewardHistory.push(structuredClone(run.pendingReward!));
  const node = currentNode(run);
  if (content && node.kind === 'boss') {
    const candidates = recruitmentCandidates(content, run.party, run.deck, offerSeed(node.seed, 'recruitment'));
    if (candidates.length) {
      run.pendingRecruitment = { nodeId, candidates, characterKey: null, round: 0, cardCandidates: [], pickedCards: [] };
      run.pendingReward = null; run.runStatus = 'recruitment'; return run;
    }
  }
  advance(run);
  return run;
}

export function chooseRunRewardCard(input: RunState, nodeId: string, key: string | null,
  content: ProgressionContent | null = liveProgression): RunState {
  checkContent(input, content); assertCurrent(input, nodeId, 'reward');
  const selection = input.pendingReward?.cardSelection;
  if (!content || input.pendingReward?.nodeId !== nodeId || selection?.status !== 'pending') throw new Error('当前没有可选择的卡牌奖励。');
  if (key === null && !input.pendingReward.outcome.cardOffer?.canSkip) throw new Error('本次选卡不能跳过。');
  if (key !== null && !selection.candidates.includes(key)) throw new Error('该卡不属于当前候选。');
  const run = structuredClone(input);
  if (key !== null) run.nextCardId = acquireCard(content, run.deck, key, run.nextCardId);
  Object.assign(run.pendingReward!.cardSelection!, { status: key === null ? 'skipped' : 'picked', picked: key });
  return run;
}

function nextRecruitmentRound(run: RunState, content: ProgressionContent) {
  const recruitment = run.pendingRecruitment!;
  while (recruitment.round < 3) {
    recruitment.cardCandidates = generateCardOffer(content.cards, characterPool(content, [recruitment.characterKey!]), run.deck,
      offerSeed(currentNode(run).seed, `recruit:${recruitment.characterKey}:${recruitment.round}`), content.rules.cardWeights);
    if (recruitment.cardCandidates.length) return;
    if (content.rules.recruitmentShortage !== 'skipEmptyRounds') throw new Error('新角色卡池无法完成三轮选卡。');
    recruitment.round++;
  }
  run.recruitmentHistory.push({ nodeId: recruitment.nodeId, characterKey: recruitment.characterKey!, pickedCards: [...recruitment.pickedCards] });
  advance(run);
}

export function chooseRecruit(input: RunState, nodeId: string, key: string,
  content: ProgressionContent | null = liveProgression): RunState {
  checkContent(input, content); assertCurrent(input, nodeId, 'recruitment');
  const recruitment = input.pendingRecruitment;
  if (!content || !recruitment || recruitment.nodeId !== nodeId || recruitment.characterKey || input.party.length >= 3
    || !recruitment.candidates.includes(key) || input.party.some(member => member.key === key)) throw new Error('该角色不属于当前招募候选。');
  const run = structuredClone(input);
  run.party.push({ id: Math.max(...run.party.map(member => member.id)) + 1, key });
  const relic = fixedRelic(content, key);
  if (!run.relics.some(owned => owned.key === relic.key)) run.relics.push(relic);
  run.pendingRecruitment!.characterKey = key;
  nextRecruitmentRound(run, content); return run;
}

export function chooseRecruitCard(input: RunState, nodeId: string, round: number, key: string,
  content: ProgressionContent | null = liveProgression): RunState {
  checkContent(input, content); assertCurrent(input, nodeId, 'recruitment');
  const recruitment = input.pendingRecruitment;
  if (!content || !recruitment?.characterKey || recruitment.nodeId !== nodeId || recruitment.round !== round || recruitment.round >= 3
    || !recruitment.cardCandidates.includes(key)) throw new Error('该卡不属于当前招募轮次。');
  const run = structuredClone(input);
  run.nextCardId = acquireCard(content, run.deck, key, run.nextCardId);
  run.pendingRecruitment!.pickedCards.push(key); run.pendingRecruitment!.round++;
  nextRecruitmentRound(run, content); return run;
}

export function leaveSafeNode(input: RunState, nodeId: string): RunState {
  assertCurrent(input, nodeId, 'safe');
  if (isBattleNode(currentNode(input))) throw new Error('战斗节点不能作为安全节点跳过。');
  const run = structuredClone(input); advance(run); return run;
}
