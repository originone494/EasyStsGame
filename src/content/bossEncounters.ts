import type { EncounterDefinition } from '../game/model';

// Prototype encounters and 100-point target only; final Boss content is step 12.
export const bossEncounters: EncounterDefinition[] = [1, 2, 3].map(floor => ({
  id: `boss-floor-${floor}`, name: `第${floor}层Boss挑战`, description: '接触时按累计输出判定挑战结果。',
  player: 6, units: [{ kind: 'warden', position: 11 }], boss: { unitIndex: 0, baseMaxHp: 100 },
}));
