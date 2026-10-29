export type Effect = { type: 'damage'; amount: number; hits?: number } | { type: 'draw' | 'heal' | 'push'; amount: number } | { type: 'move'; amount: number };
export interface CardDef { name: string; kind: string; description: string; target: 'enemy' | 'direction' | 'none'; effects: Effect[]; exhaust?: boolean }
export const cards: Record<string, CardDef> = {
  strike: { name: '基础攻击', kind: '通用 · 攻击', description: '对任意敌人造成 4 点伤害。', target: 'enemy', effects: [{ type: 'damage', amount: 4 }] },
  step: { name: '移步', kind: '通用 · 移动', description: '向左或向右移动 1 格。终点须为空。', target: 'direction', effects: [{ type: 'move', amount: 1 }] },
  push: { name: '击退', kind: '通用 · 战术', description: '将敌人向远离你的方向击退 2 格。碰撞传递剩余位移。', target: 'enemy', effects: [{ type: 'push', amount: 2 }] },
  combo: { name: '连击', kind: '角色 · 攻击', description: '对任意敌人造成 3 次 2 点伤害。目标死亡后停止。', target: 'enemy', effects: [{ type: 'damage', amount: 2, hits: 3 }] },
  prepare: { name: '整备', kind: '角色 · 技能', description: '抽 2 张牌。消耗：本场不再回到牌组。', target: 'none', effects: [{ type: 'draw', amount: 2 }], exhaust: true },
  debugHeal: { name: '收尾治疗（测试）', kind: '开发用 · 不进入正式牌组', description: '造成 4 点伤害，然后恢复 5 点生命。', target: 'enemy', effects: [{ type: 'damage', amount: 4 }, { type: 'heal', amount: 5 }] },
};
export const startingDeck = ['strike', 'strike', 'step', 'step', 'push', 'combo', 'prepare'];
