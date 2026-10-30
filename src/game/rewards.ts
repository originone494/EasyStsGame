import type { AdaptationAttributes, BattleState, RewardConfig, RewardOutcome, ScoreSummary } from './model';
import { attributeKeys, zeroAttributes } from '../content/economy';
import { summarizeScore } from './scoring';

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
  validateRewardConfig(config); validateAttributes(current);
  integer(input.hpLost, '有效生命损失'); integer(input.maxHp, '计分最大生命');
  const hpLost = Math.min(input.hpLost, input.maxHp), maxHp = input.maxHp;
  const ratio = maxHp ? hpLost / maxHp : 0;
  const score = { hpLost, maxHp, ratio, percent: ratio * 100 };
  const allowed = eligible && maxHp > 0;
  const numerator = BigInt(maxHp) + 4n * BigInt(hpLost), denominator = 5n * BigInt(maxHp);
  const scaled = (base: number) => !allowed ? 0 : Number((BigInt(base) * numerator + denominator - 1n) / denominator);
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
  const reward = calculateNonBossRewards(s.rewardConfig, summarizeScore(s.scoring), s.attributes,
    s.status === 'won' && s.finishReason !== 'boss-contact');
  integer(s.gold, '金币余额');
  const balance = s.gold + reward.gold;
  integer(balance, '结算后金币');
  // Commit together after all calculations and validation have succeeded.
  s.gold = balance; s.attributes = { ...reward.attributesAfter }; s.reward = reward;
}
