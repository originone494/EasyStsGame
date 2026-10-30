import type { CardDefinition } from '../game/model';
import { characters } from './characters';
export type { Effect, CardDefinition, CardDefinition as CardDef } from '../game/model';
export const cards: Record<string, CardDefinition> = {
  strike: { name: '基础攻击', kind: '通用 · 攻击', description: '对任意敌人造成 4 点伤害。', target: 'enemy', effects: [{ type: 'damage', amount: 4 }] },
  step: { name: '移步', kind: '通用 · 移动', description: '向左或向右移动 1 格。终点须为空。', target: 'direction', effects: [{ type: 'move', amount: 1 }] },
  push: { name: '击退', kind: '通用 · 战术', description: '将敌人向远离你的方向击退 2 格。碰撞传递剩余位移。', target: 'enemy', effects: [{ type: 'push', amount: 2 }] },
  combo: { name: '连击', kind: '角色 · 攻击', description: '对任意敌人造成 3 次 2 点伤害。目标死亡后停止。', target: 'enemy', effects: [{ type: 'damage', amount: 2, hits: 3 }] },
  prepare: { name: '整备', kind: '角色 · 技能', description: '抽 2 张牌。消耗：本场不再回到牌组。', target: 'none', effects: [{ type: 'draw', amount: 2 }], exhaust: true },
  debugHeal: { name: '收尾治疗（测试）', kind: '开发用 · 不进入正式牌组', description: '造成 4 点伤害，然后恢复 5 点生命。', target: 'enemy', effects: [{ type: 'damage', amount: 4 }, { type: 'heal', amount: 5 }] },
  debugZero: { name: '零伤害（测试）', art: 'strike', kind: '开发用 · 不进入正式牌组', description: '对敌人结算 0 点伤害，用于验证事件与遗物快照。', target: 'enemy', effects: [{ type: 'damage', amount: 0 }] },
  debugCost: { name: '生命代价（测试）', art: 'debugHeal', kind: '开发用 · 不进入正式牌组', description: '先失去 3 点生命，再恢复 5 点生命。代价致死则立即失败。', target: 'none', effects: [{ type: 'loseHp', amount: 3 }, { type: 'heal', amount: 5 }] },
  debugFormula: { name: '倍率攻击（测试）', art: 'strike', kind: '开发用 · 不进入正式牌组', description: '基础10伤害，独立乘1.2与1.3，最终造成16伤害。', target: 'enemy', effects: [{ type: 'damage', amount: 10, multipliers: [1.2, 1.3] }] },
  debugMulti: { name: '分段取整（测试）', art: 'combo', kind: '开发用 · 不进入正式牌组', description: '3段基础1伤害，每段独立乘1.2并向上取整为2。', target: 'enemy', effects: [{ type: 'damage', amount: 1, hits: 3, multipliers: [1.2] }] },
  debugWave: { name: '同步横扫（测试）', art: 'combo', kind: '开发用 · 不进入正式牌组', description: '对全部存活敌人同步造成4伤害，然后恢复2生命。', target: 'none', effects: [{ type: 'damageAll', amount: 4 }, { type: 'heal', amount: 2 }] },
};
export const basicStartingCards = ['strike', 'strike', 'step', 'step', 'push'];
export function getStartingDeck(character: string): string[] {
  if (!Object.hasOwn(characters, character)) throw new Error(`未知角色：${character}`);
  return [...basicStartingCards, ...characters[character].startingCards];
}
export const startingDeck = getStartingDeck('wanderer');
