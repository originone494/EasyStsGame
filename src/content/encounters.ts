import type { BattleConfig, EncounterDefinition } from '../game/model';
export type { EncounterDefinition as Encounter } from '../game/model';
export const encounters: EncounterDefinition[] = [
  { id: 'chase', name: '单侧追击', description: '同侧两敌，试试把前排击退到后排。', player: 6, units: [{ kind: 'crawler', position: 9 }, { kind: 'brute', position: 10 }] },
  { id: 'surround', name: '双侧包围', description: '两面受敌。先处理距离最近的威胁。', player: 6, units: [{ kind: 'runner', position: 2 }, { kind: 'crawler', position: 9 }, { kind: 'runner', position: 11 }] },
  { id: 'edge', name: '边界压力', description: '背靠边界，注意不同敌人的移动速度。', player: 1, units: [{ kind: 'crawler', position: 0 }, { kind: 'runner', position: 5 }, { kind: 'brute', position: 9 }, { kind: 'crawler', position: 11 }] },
];
export const prototype: BattleConfig = { size: 13, maxHp: 20, handSize: 3, seed: 157, character: 'wanderer' };
