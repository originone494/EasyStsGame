import type { AdaptationAttributes } from '../game/model';

interface RewardFixture {
  name: string; cards: string[];
  units: { id: number; position: number; speed: number; damage: number }[];
  hp?: number; attributes?: Partial<AdaptationAttributes>;
}
const partial = [{ id: 1, position: 9, speed: 0, damage: 0 }, { id: 2, position: 7, speed: 1, damage: 0 }];
const full = [{ id: 1, position: 9, speed: 0, damage: 0 }];
export const rewardFixtures: Record<string, RewardFixture> = {
  scoreZero: { name: '零评分保底', cards: [], units: [{ id: 1, position: 7, speed: 1, damage: 0 }] },
  scoreHalf: { name: '50%评分奖励', cards: ['debugScoreKill'], units: partial },
  scoreSeventyFive: { name: '75%评分与接触消失', cards: ['debugScoreKill', 'debugScoreChip'], units: partial },
  scoreFull: { name: '满评分奖励', cards: ['debugScoreKill'], units: full },
  scoreCap: { name: '楼层属性上限', cards: ['debugScoreKill'], units: full, attributes: { sunAdaptation: 49 } },
  scoreDefeat: { name: '失败没有保底', cards: [], hp: 1, units: [{ id: 1, position: 7, speed: 1, damage: 3 }] },
};
