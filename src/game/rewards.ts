import type { AdaptationAttributes, BattleState, BossState, RewardConfig, RewardOutcome, ScoreSummary } from './model';
import { attributeKeys, bossEconomyRules, zeroAttributes } from '../content/economy';
import { summarizeScore } from './scoring';
import { bossScore, bossSucceeded } from './boss';

function integer(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}必须为非负安全整数。`);
}
function validateAttributes(attributes: AdaptationAttributes) {
  for (const key of attributeKeys) integer(attributes[key], '属性');
}
export function validateRewardConfig(config: RewardConfig): RewardConfig {
  integer(config.floor, '楼层'); integer(config.attributeCap, '楼层属性上限'); integer(config.baseGold, '金币基准');
  if (config.floor < 1) throw new Error('楼层必须从1开始。');
  validateAttributes(config.baseAttributes);
  if (config.cardOffer) {
    integer(config.cardOffer.choices, '候选数'); integer(config.cardOffer.picks, '选牌数');
    if (config.cardOffer.picks < 1 || config.cardOffer.choices < config.cardOffer.picks || typeof config.cardOffer.canSkip !== 'boolean') throw new Error('卡牌奖励资格无效。');
  }
  return structuredClone(config);
}

// Use integer fractions for rewards; floating score percentages are display only.
export function calculateNonBossRewards(config: RewardConfig, input: Pick<ScoreSummary, 'hpLost' | 'maxHp'>,
  current: AdaptationAttributes, eligible = true): RewardOutcome {
  integer(input.hpLost, '有效生命损失'); integer(input.maxHp, '计分最大生命');
  const hpLost = Math.min(input.hpLost, input.maxHp), maxHp = input.maxHp;
  const ratio = maxHp ? hpLost / maxHp : 0;
  const score = { hpLost, maxHp, ratio, percent: ratio * 100 };
  const allowed = eligible && maxHp > 0;
  const numerator = BigInt(maxHp) + 4n * BigInt(hpLost), denominator = 5n * BigInt(maxHp);
  return calculateRewards(config, score, current, numerator, denominator, allowed);
}

export function calculateBossRewards(config: RewardConfig, boss: BossState,
  current: AdaptationAttributes, eligible = true): RewardOutcome {
  if (config.floor > 3) throw new Error('Boss楼层必须为1至3。');
  const score = bossScore(boss);
  const allowed = eligible && bossSucceeded(boss) && config.floor < 3;
  const denominator = BigInt(boss.baseMaxHp), cap = denominator * BigInt(bossEconomyRules.maxMultiplier);
  const damage = BigInt(boss.accumulatedDamage), numerator = damage < cap ? damage : cap;
  const reward = calculateRewards(config, score, current, numerator, denominator, allowed);
  reward.relicOffer = allowed ? { count: 1, rarity: config.floor === 1 ? 'common' : 'uncommon' } : null;
  return reward;
}

function calculateRewards(config: RewardConfig, score: ScoreSummary, current: AdaptationAttributes,
  numerator: bigint, denominator: bigint, allowed: boolean): RewardOutcome {
  validateRewardConfig(config); validateAttributes(current);
  const scaled = (base: number) => {
    if (!allowed) return 0;
    const result = (BigInt(base) * numerator + denominator - 1n) / denominator;
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('奖励超出安全整数范围。');
    return Number(result);
  };
  const scaledAttributes = zeroAttributes(), gainedAttributes = zeroAttributes(), overflowAttributes = zeroAttributes();
  const attributesAfter = { ...current };
  for (const key of attributeKeys) {
    scaledAttributes[key] = scaled(config.baseAttributes[key]);
    // Only new gains are capped. Defensive handling of a developer preset
    // already over cap must not silently reduce previously held attributes.
    gainedAttributes[key] = Math.min(scaledAttributes[key], Math.max(0, config.attributeCap - current[key]));
    overflowAttributes[key] = scaledAttributes[key] - gainedAttributes[key];
    attributesAfter[key] += gainedAttributes[key];
  }
  return { eligible: allowed, score, rewardRatio: allowed ? Number(numerator) / Number(denominator) : 0,
    gold: scaled(config.baseGold), scaledAttributes, gainedAttributes, overflowAttributes, attributesAfter,
    cardOffer: allowed && config.cardOffer ? structuredClone(config.cardOffer) : null };
}

export function grantBattleRewards(s: BattleState) {
  if (s.status === 'playing' || s.reward !== null) return;
  const reward = s.boss ? calculateBossRewards(s.rewardConfig, s.boss, s.attributes,
    s.status === 'won' && s.finishReason === 'boss-contact' && s.boss.hasContactedPlayer)
    : calculateNonBossRewards(s.rewardConfig, summarizeScore(s.scoring), s.attributes,
      s.status === 'won' && s.finishReason !== 'boss-contact');
  integer(s.gold, '金币余额');
  const balance = s.gold + reward.gold;
  integer(balance, '结算后金币');
  // Commit together after all calculations and validation have succeeded.
  s.gold = balance; s.attributes = { ...reward.attributesAfter }; s.reward = reward;
}
