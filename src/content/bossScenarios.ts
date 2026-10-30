import type { AdaptationAttributes } from '../game/model';

interface BossFixture {
  name: string; damage: number; position: number; cards: string[];
  floor?: number; minion?: 'kill' | 'contact'; hp?: number; attributes?: Partial<AdaptationAttributes>;
}
export const bossFixtures: Record<string, BossFixture> = {
  boss99: { name: '99%接触失败', damage: 99, position: 7, cards: [] },
  boss100: { name: '100%接触成功', damage: 100, position: 7, cards: [] },
  boss110: { name: '110%后继续输出', damage: 110, position: 9, cards: ['debugScoreKill'] },
  bossPush: { name: 'Boss完整击退2格', damage: 100, position: 7, cards: ['push'] },
  bossMixed: { name: '群伤击杀小怪但Boss继续', damage: 0, position: 10, cards: ['debugWave'], minion: 'kill' },
  bossMinionContact: { name: '小怪接触消失不结束挑战', damage: 110, position: 9, cards: [], minion: 'contact' },
  boss600: { name: '600%与5倍奖励上限', damage: 600, position: 7, cards: [], floor: 2,
    attributes: { sunAdaptation: 95, rainAdaptation: 95, windAdaptation: 95 } },
  bossFinal: { name: '第三层600%通关无奖励', damage: 600, position: 7, cards: [], floor: 3 },
  bossMulti: { name: '多段跨越100%持续结算', damage: 99, position: 9, cards: ['combo'] },
  bossLethal: { name: '接触前生命归零失败', damage: 110, position: 9, cards: ['debugCost'], hp: 3 },
};
