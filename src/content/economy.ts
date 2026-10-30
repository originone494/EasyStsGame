import type { AdaptationAttributes, RewardConfig } from '../game/model';

// User-approved adjustable test values, not a formal floor progression curve.
export const economyRules = { normalGold: 20, normalAttributePoints: 5, floorAttributeCaps: [50, 100, 200] };
export const bossEconomyRules = { gold: 100, attributePoints: 10, maxMultiplier: 5 };
export const attributeKeys = ['sunAdaptation', 'rainAdaptation', 'windAdaptation'] as const;
export const zeroAttributes = (): AdaptationAttributes => ({ sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 });

export function normalRewardConfig(attribute: keyof AdaptationAttributes, floor = 1): RewardConfig {
  const attributeCap = economyRules.floorAttributeCaps[floor - 1];
  if (!Number.isSafeInteger(floor) || floor < 1 || attributeCap === undefined) throw new Error('奖励楼层配置无效。');
  return { floor, attributeCap, baseGold: economyRules.normalGold,
    baseAttributes: { ...zeroAttributes(), [attribute]: economyRules.normalAttributePoints },
    cardOffer: { choices: 3, picks: 1, canSkip: true } };
}

export function bossRewardConfig(floor = 1): RewardConfig {
  const config = normalRewardConfig('sunAdaptation', floor);
  const points = bossEconomyRules.attributePoints;
  return { ...config, baseGold: bossEconomyRules.gold,
    baseAttributes: { sunAdaptation: points, rainAdaptation: points, windAdaptation: points },
    cardOffer: { choices: 3, picks: 1, canSkip: true, rarity: 'rare' } };
}
