export const enemies = {
  crawler: { name: '爬行者', hp: 6, speed: 1, damage: 3, glyph: '◆' },
  runner: { name: '疾行兽', hp: 4, speed: 2, damage: 4, glyph: '▲' },
  brute: { name: '重甲兽', hp: 10, speed: 1, damage: 6, glyph: '⬟' },
};
export type EnemyKind = keyof typeof enemies;
