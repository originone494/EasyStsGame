import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDevelopmentRewards, removeDevelopmentRewards, developmentProgression as content } from '../src/content/developmentRewards';
import { mapRules } from '../src/content/map';
import { createDeck } from '../src/game/deck';
import { acknowledgeRunReward, actInRun, chooseRecruit, chooseRecruitCard, chooseRunRewardCard, createRun, currentNode, enterRunNode, settleRunBattle } from '../src/game/run';
import { damageEnemies, damagePlayer } from '../src/game/resolution';
import { processEvents } from '../src/game/eventQueue';
import { cardCandidates, characterPool, fixedRelic, recruitmentCandidates, relicCandidate, validateProgressionContent, type ProgressionContent } from '../src/game/selection';
import type { RunState } from '../src/game/model';
import { createRewardScenario } from '../src/game/runScenarios';

beforeAll(installDevelopmentRewards);
afterAll(removeDevelopmentRewards);
const fresh = () => createRewardScenario(157, content);
function win(input: RunState, id = currentNode(input).id, catalog = content): RunState {
  let run = input.runStatus === 'map' ? enterRunNode(input, id, catalog) : input;
  damageEnemies(run.battle!, run.battle!.enemies.map(enemy => enemy.id), 100); processEvents(run.battle!);
  run = settleRunBattle(run, catalog);
  for (let i = 0; run.runStatus === 'battle' && i < 10; i++) run = actInRun(run, { type: 'endTurn' }, catalog);
  expect(['reward', 'won']).toContain(run.runStatus); return run;
}
function skip(run: RunState, catalog = content) {
  return run.pendingReward?.cardSelection?.status === 'pending' ? chooseRunRewardCard(run, currentNode(run).id, null, catalog) : run;
}
function recruitAll(input: RunState, catalog = content): RunState {
  let run = input;
  const recruitment = run.pendingRecruitment!;
  run = chooseRecruit(run, recruitment.nodeId, recruitment.candidates[0], catalog);
  for (let round = 0; round < 3; round++) run = chooseRecruitCard(run, recruitment.nodeId, round, run.pendingRecruitment!.cardCandidates[0], catalog);
  return run;
}

describe('步骤9：奖励选卡与招募状态机（隔离内容）', () => {
  it('正常开局等待正式内容，不启用隔离角色；配置开局为7张牌及固定遗物，每角色36张可解锁卡', () => {
    const normal = createRun(157); expect(normal.progressionId).toBeNull(); expect(normal.party).toEqual([{ id: 0, key: 'wanderer' }]);
    const run = createRun(157, mapRules, content);
    expect(run.deck).toHaveLength(7); expect(run.relics.map(relic => relic.key)).toEqual([content.characters[content.initialCharacter].relicKey]);
    for (const character of Object.values(content.characters)) {
      expect(character.cardPool).toHaveLength(36); expect(new Set(character.cardPool!.map(key => content.cards[key].name)).size).toBe(36);
    }
    expect(run.party[0]).not.toHaveProperty('hp'); expect(run.party[0]).not.toHaveProperty('position');
  });
  it('战后必须完成选卡或主动跳过，选牌只加入一次并保持永久ID唯一', () => {
    const pending = win(fresh()), id = currentNode(pending).id, before = structuredClone(pending);
    expect(pending.pendingReward!.cardSelection!.candidates).toHaveLength(3);
    expect(() => acknowledgeRunReward(pending, id, content)).toThrow('先选卡');
    expect(() => chooseRunRewardCard(pending, id, 'debugRoute', content)).toThrow('候选');
    const key = pending.pendingReward!.cardSelection!.candidates[0], selected = chooseRunRewardCard(pending, id, key, content);
    expect(pending).toEqual(before); expect(selected.deck).toHaveLength(2); expect(selected.deck.at(-1)!.key).toBe(key);
    expect(new Set(selected.deck.map(card => card.id)).size).toBe(selected.deck.length);
    expect(() => chooseRunRewardCard(selected, id, key, content)).toThrow('没有可选择');
    const next = acknowledgeRunReward(selected, id, content);
    expect(next.gold).toBe(pending.gold); expect(next.rewardHistory[0].cardSelection).toMatchObject({ status: 'picked', picked: key });
    expect(() => acknowledgeRunReward(next, id, content)).toThrow('当前');
    expect(enterRunNode(next, 'f1-b2', content).battle!.deck).toEqual(selected.deck);
  });
  it('跳过不加卡；已持有达到上限的角色卡不再出现，空池结果可正常返回地图', () => {
    const pending = win(fresh()), skipped = skip(pending);
    expect(skipped.deck).toEqual(pending.deck); expect(skipped.pendingReward!.cardSelection!.status).toBe('skipped');
    const limited = structuredClone(content) as ProgressionContent;
    for (const definition of Object.values(limited.cards)) definition.maxOwned = 1;
    const run = createRun(157, mapRules, limited);
    run.deck = createDeck(characterPool(limited, [limited.initialCharacter])); run.nextCardId = run.deck.length;
    const full = win(run, 'f1-b1', limited);
    expect(full.pendingReward!.cardSelection).toMatchObject({ status: 'empty', candidates: [] });
    expect(acknowledgeRunReward(full, 'f1-b1', limited).runStatus).toBe('map');
  });
  it('普通和精英胜利都选当前队伍角色卡，0%与100%评分不改变卡牌候选', () => {
    const config = { ...mapRules, elitesPerFloor: 1 };
    const run = createRun(157, config, content), elite = run.mapNodes.find(node => node.floor === 1 && node.kind === 'elite')!;
    const best = win(run, elite.id);
    let low = structuredClone(run); low.currentHP = low.maxHP = 100;
    low = enterRunNode(low, elite.id, content);
    for (let i = 0; low.runStatus === 'battle' && i < 20; i++) low = actInRun(low, { type: 'endTurn' }, content);
    expect(low.runStatus).toBe('reward'); expect(low.pendingReward!.outcome.score.percent).toBe(0);
    expect(low.pendingReward!.cardSelection!.candidates).toEqual(best.pendingReward!.cardSelection!.candidates);
    expect(best.pendingReward!.cardSelection!.candidates.every(key => content.cards[key].character === content.initialCharacter)).toBe(true);
  });
  it('Boss先给旧队伍稀有卡和指定档通用遗物，再进入必须选择的招募', () => {
    let run = win(fresh(), 'f1-boss');
    const reward = run.pendingReward!;
    expect(reward.cardSelection!.candidates).toHaveLength(3);
    expect(reward.cardSelection!.candidates.every(key => content.cards[key].rarity === 'rare' && content.cards[key].character === content.initialCharacter)).toBe(true);
    expect(content.relics[reward.relicKey!].rarity).toBe('common'); expect(run.relics).toHaveLength(2);
    expect(settleRunBattle(run, content)).toEqual(run);
    run = acknowledgeRunReward(skip(run), 'f1-boss', content);
    expect(run.runStatus).toBe('recruitment'); expect(run.currentFloor).toBe(1); expect(run.pendingReward).toBeNull();
    expect(run.rewardHistory).toHaveLength(1); expect(run.pendingRecruitment!.candidates).toHaveLength(3);
    expect(run.pendingRecruitment!.candidates).not.toContain(content.initialCharacter);
    expect(() => enterRunNode(run, 'f1-b1', content)).toThrow('当前');
    expect(() => acknowledgeRunReward(run, 'f1-boss', content)).toThrow('当前');
  });
  it('招募三轮必须逐次选新角色卡，每轮重新过滤上限，旧轮次重放不能多加卡', () => {
    let run = acknowledgeRunReward(skip(win(fresh(), 'f1-boss')), 'f1-boss', content);
    const before = structuredClone(run), key = run.pendingRecruitment!.candidates[0], hp = run.currentHP;
    run = chooseRecruit(run, 'f1-boss', key, content);
    expect(before.party).toHaveLength(1); expect(run.party).toHaveLength(2); expect(run.relics.at(-1)!.key).toBe(content.characters[key].relicKey);
    expect(run.currentHP).toBe(hp); expect(run.maxHP).toBe(before.maxHP);
    expect(() => chooseRecruit(run, 'f1-boss', key, content)).toThrow('候选');
    const oldKey = run.pendingRecruitment!.cardCandidates[0];
    run = chooseRecruitCard(run, 'f1-boss', 0, oldKey, content);
    expect(() => chooseRecruitCard(run, 'f1-boss', 0, oldKey, content)).toThrow('轮次');
    if (content.cards[oldKey].maxOwned === 1) expect(run.pendingRecruitment!.cardCandidates).not.toContain(oldKey);
    for (const round of [1, 2]) {
      expect(run.pendingRecruitment!.round).toBe(round);
      expect(run.pendingRecruitment!.cardCandidates.every(card => content.cards[card].character === key)).toBe(true);
      expect(() => chooseRecruitCard(run, 'f1-boss', round, 'debugRoute', content)).toThrow('轮次');
      run = chooseRecruitCard(run, 'f1-boss', round, run.pendingRecruitment!.cardCandidates[0], content);
    }
    expect(run.runStatus).toBe('map'); expect(run.currentFloor).toBe(2); expect(run.deck).toHaveLength(before.deck.length + 3);
    expect(run.recruitmentHistory[0]).toMatchObject({ characterKey: key }); expect(run.recruitmentHistory[0].pickedCards).toHaveLength(3);
    expect(run.completedNodes).toEqual(['f1-boss']);
  });
  it('两次Boss可从1人到3人，招募后36卡进入合并池，遗物按获得顺序进入下一场', () => {
    let run = fresh();
    for (const floor of [1, 2]) {
      run = recruitAll(acknowledgeRunReward(skip(win(run, `f${floor}-boss`)), `f${floor}-boss`, content));
      expect(run.party).toHaveLength(floor + 1);
    }
    expect(new Set(run.party.map(member => member.key)).size).toBe(3);
    expect(characterPool(content, run.party.map(member => member.key))).toHaveLength(108);
    expect(recruitmentCandidates(content, run.party, run.deck, 1)).toEqual([]);
    const next = enterRunNode(run, 'f3-b1', content);
    expect(next.battle!.party).toEqual(run.party); expect(next.battle!.listeners.map(listener => listener.definition.key)).toEqual(run.relics.map(relic => relic.key));
    expect(next.battle!.listeners.every(listener => listener.totalTriggers === 0 && listener.active)).toBe(true);
    const available = cardCandidates(content, run.party, run.deck, 1);
    expect(available.every(key => run.party.some(member => member.key === content.cards[key].character))).toBe(true);
  });
  it('队伍满员或没有可招募角色时直接升层，不伪造招募', () => {
    const unavailable = structuredClone(content) as ProgressionContent;
    for (const definition of Object.values(unavailable.characters)) definition.recruitable = false;
    const pending = win(createRewardScenario(157, unavailable), 'f1-boss', unavailable);
    const next = acknowledgeRunReward(skip(pending, unavailable), 'f1-boss', unavailable);
    expect(next.runStatus).toBe('map'); expect(next.currentFloor).toBe(2); expect(next.party).toHaveLength(1);
    expect(next.recruitmentHistory).toEqual([]);
  });
  it('剩余获取容量不足3张的角色不进入必须招满三张的候选，候选不足3名不重复凑数', () => {
    const limited = structuredClone(content) as ProgressionContent;
    const keys = Object.keys(limited.characters), excluded = keys[1];
    for (const key of limited.characters[excluded].cardPool!) limited.cards[key].maxOwned = 1;
    const deck = createDeck(limited.characters[excluded].cardPool!.slice(0, 34));
    const candidates = recruitmentCandidates(limited, [{ id: 0, key: keys[0] }], deck, 1);
    expect(candidates).toHaveLength(2); expect(candidates).not.toContain(excluded);
  });
  it('遗物不重复且不混入角色专属，指定档耗尽按显式测试权重替代，全空返回空', () => {
    const common = relicCandidate(content, [], 'common', 1)!;
    expect(content.relics[common].character).toBeUndefined(); expect(content.relics[common].rarity).toBe('common');
    expect(relicCandidate(content, [content.relics[common].listener], 'common', 1)).not.toBe(common);
    const ownedCommon = Object.values(content.relics).filter(relic => relic.rarity === 'common').map(relic => relic.listener);
    const fallback = relicCandidate(content, ownedCommon, 'common', 2)!;
    expect(content.relics[fallback].rarity).not.toBe('common');
    expect(relicCandidate(content, Object.values(content.relics).map(relic => relic.listener), 'common', 2)).toBeNull();
  });
  it('第三层直接通关不发卡、不发遗物也不招募，即使队伍未满', () => {
    let run = fresh(); run.currentFloor = 3; run.currentNodeIndex = run.mapNodes.findIndex(node => node.id === 'f3-boss');
    const before = structuredClone(run); run = win(run, 'f3-boss');
    expect(run.runStatus).toBe('won'); expect(run.pendingReward).toBeNull(); expect(run.pendingRecruitment).toBeNull();
    expect(run.deck).toEqual(before.deck); expect(run.gold).toBe(before.gold); expect(run.relics).toEqual(before.relics); expect(run.party).toEqual(before.party);
  });
  it('失败无候选或招募，不允许通过空内容配置绕过选择', () => {
    let run = enterRunNode(fresh(), 'f1-b1', content); damagePlayer(run.battle!, 999); run = settleRunBattle(run, content);
    expect(run.runStatus).toBe('lost'); expect(run.pendingReward).toBeNull(); expect(run.pendingRecruitment).toBeNull();
    expect(() => enterRunNode(fresh(), 'f1-b1')).toThrow('配置');
    expect(() => fixedRelic({ ...content, relics: {} }, content.initialCharacter)).toThrow('固定遗物');
  });
  it('JSON恢复保留奖励候选、已选卡和招募轮次，继续后不重发金币或遗物', () => {
    const pending = win(fresh(), 'f1-boss'), restored = JSON.parse(JSON.stringify(pending)) as RunState;
    expect(settleRunBattle(restored, content)).toEqual(pending);
    let run = acknowledgeRunReward(skip(restored), 'f1-boss', content);
    run = chooseRecruit(run, 'f1-boss', run.pendingRecruitment!.candidates[0], content);
    run = chooseRecruitCard(run, 'f1-boss', 0, run.pendingRecruitment!.cardCandidates[0], content);
    const resumed = JSON.parse(JSON.stringify(run)) as RunState;
    expect(resumed.pendingRecruitment).toEqual(run.pendingRecruitment);
    const next = chooseRecruitCard(resumed, 'f1-boss', 1, resumed.pendingRecruitment!.cardCandidates[0], content);
    expect(next.gold).toBe(pending.gold); expect(next.relics).toEqual(run.relics); expect(next.deck).toHaveLength(run.deck.length + 1);
  });
  it('内容接入验证拒绝缺卡、错误来源、同名卡和无效权重，零权重卡不充当可招募容量', () => {
    const broken = structuredClone(content) as ProgressionContent;
    broken.characters[broken.initialCharacter].cardPool!.pop();
    expect(() => validateProgressionContent(broken)).toThrow('36');
    const duplicate = structuredClone(content) as ProgressionContent;
    const pool = duplicate.characters[duplicate.initialCharacter].cardPool!;
    duplicate.cards[pool[0]].name = duplicate.cards[pool[1]].name;
    expect(() => validateProgressionContent(duplicate)).toThrow('不同名');
    const zero = structuredClone(content) as ProgressionContent;
    zero.rules.cardWeights = { common: 0, uncommon: 0, rare: 0 };
    expect(() => validateProgressionContent(zero)).toThrow('权重');
    const onlyRare = structuredClone(content) as ProgressionContent;
    onlyRare.rules.cardWeights = { common: 0, uncommon: 0, rare: 1 };
    const key = Object.keys(onlyRare.characters)[1];
    for (const card of onlyRare.characters[key].cardPool!) if (onlyRare.cards[card].rarity === 'rare') onlyRare.cards[card].maxOwned = 1;
    const deck = createDeck(onlyRare.characters[key].cardPool!.filter(card => onlyRare.cards[card].rarity === 'rare'));
    expect(recruitmentCandidates(onlyRare, [{ id: 0, key: onlyRare.initialCharacter }], deck, 1)).not.toContain(key);
  });
});
