import type { BattleMapNode, MapGenerationConfig, MapNode, SafeMapNode } from './model';
import { encounters } from '../content/encounters';
import { bossRewardConfig, normalRewardConfig } from '../content/economy';
import { nextRandom, shuffle } from './random';
import { validateRewardConfig } from './rewards';

export const floorBattleCounts = [10, 7, 5] as const;
export const isBattleNode = (node: MapNode): node is BattleMapNode => ['battle', 'elite', 'boss'].includes(node.kind);

function integer(value: number, name: string, min = 0, max = 100) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name}配置超出范围。`);
}

export function generateMap(seed: number, config: MapGenerationConfig): MapNode[] {
  integer(seed, '地图种子', 0, 4294967295);
  integer(config.safeNodesPerFloor, '每层安全节点总数', 2);
  integer(config.minimumShops, '最少商店数', 1); integer(config.minimumCampfires, '最少火堆数', 1);
  if (config.minimumShops + config.minimumCampfires > config.safeNodesPerFloor) throw new Error('安全节点不足以满足商店和火堆最低数量。');
  const weightedKinds = (['shop', 'campfire', 'event'] as const).map(kind => [kind, config.safeNodeWeights[kind]] as const);
  for (const [, weight] of weightedKinds) integer(weight, '安全节点权重');
  if (!weightedKinds.some(([, weight]) => weight > 0)) throw new Error('安全节点权重不能全为0。');
  integer(config.elitesPerFloor, '每层精英数量', 0, Math.min(...floorBattleCounts) - 1);
  for (const floor of [1, 2, 3]) validateRewardConfig({ ...normalRewardConfig('sunAdaptation', floor),
    baseGold: config.eliteBaseGold, baseAttributes: config.eliteBaseAttributes });
  let rng = (seed ^ 0x6d617000) >>> 0;
  const random = () => { rng = nextRandom(rng); return rng; };
  const choose = (min: number, max: number) => min + Math.floor(random() / 4294967296 * (max - min + 1));
  const nodes: MapNode[] = [];
  let globalBattleIndex = 0;
  for (let floor = 1; floor <= 3; floor++) {
    const nonBoss = floorBattleCounts[floor - 1] - 1;
    const selected = shuffle(Array.from({ length: nonBoss }, (_, i) => i), random()); rng = selected.seed;
    const elites = new Set(selected.values.slice(0, config.elitesPerFloor));
    // This is a stable catalogue order, not a required traversal route.
    // Build the battle skeleton before inserting any safe node.
    const battles: BattleMapNode[] = Array.from({ length: nonBoss }, (_, index) => {
      const encounter = choose(0, encounters.length - 1);
      const rewardConfig = normalRewardConfig(encounters[encounter].rewardAttribute ?? 'sunAdaptation', floor);
      if (elites.has(index)) {
        rewardConfig.baseGold = config.eliteBaseGold; rewardConfig.baseAttributes = { ...config.eliteBaseAttributes };
      }
      return { id: `f${floor}-b${index + 1}`, kind: elites.has(index) ? 'elite' : 'battle', floor,
        seed: random(), encounter, battleIndex: index + 1, globalBattleIndex: ++globalBattleIndex, rewardConfig };
    });
    const boss: BattleMapNode = { id: `f${floor}-boss`, kind: 'boss', floor, seed: random(), encounter: 0,
      battleIndex: nonBoss + 1, globalBattleIndex: ++globalBattleIndex, rewardConfig: bossRewardConfig(floor) };
    const gaps: SafeMapNode[][] = Array.from({ length: nonBoss }, () => []);
    const counters = { shop: 0, campfire: 0, event: 0 };
    const add = (kind: SafeMapNode['kind'], count: number) => {
      for (let i = 0; i < count; i++) {
        const gap = choose(0, nonBoss - 1);
        gaps[gap].push({ id: `f${floor}-${kind}-${++counters[kind]}`, kind, floor, seed: random(), beforeBoss: false });
      }
    };
    add('shop', config.minimumShops); add('campfire', config.minimumCampfires);
    for (let i = config.minimumShops + config.minimumCampfires; i < config.safeNodesPerFloor; i++) {
      let draw = choose(0, weightedKinds.reduce((sum, [, weight]) => sum + weight, 0) - 1);
      const kind = weightedKinds.find(([, weight]) => { draw -= weight; return draw < 0; })![0];
      add(kind, 1);
    }
    for (const [index, battle] of battles.entries()) {
      const mixed = shuffle(gaps[index], random()); rng = mixed.seed;
      nodes.push(battle, ...mixed.values);
    }
    nodes.push({ id: `f${floor}-boss-camp`, kind: 'campfire', floor, seed: random(), beforeBoss: true }, boss);
  }
  return nodes;
}
