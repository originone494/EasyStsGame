import type { BossState, EnemyState, ScoreSummary } from './model';

export function createBoss(enemies: readonly Pick<EnemyState, 'id' | 'maxHp'>[], enemyId: number, baseMaxHp: number): BossState {
  if (!Number.isSafeInteger(enemyId) || enemyId < 0 || enemies.filter(enemy => enemy.id === enemyId).length !== 1) throw new Error('Boss目标编号无效。');
  if (!Number.isSafeInteger(baseMaxHp) || baseMaxHp <= 0) throw new Error('Boss生命基准必须为正安全整数。');
  return { enemyId, baseMaxHp, accumulatedDamage: 0, hasContactedPlayer: false };
}

export function bossScore(boss: BossState): ScoreSummary {
  if (!Number.isSafeInteger(boss.baseMaxHp) || boss.baseMaxHp <= 0
    || !Number.isSafeInteger(boss.accumulatedDamage) || boss.accumulatedDamage < 0) throw new Error('Boss伤害记录无效。');
  const ratio = boss.accumulatedDamage / boss.baseMaxHp;
  // Shared reward score shape: this numerator means cumulative damage,
  // never a claim that the Boss lost this much actual HP.
  return { hpLost: boss.accumulatedDamage, maxHp: boss.baseMaxHp, ratio, percent: ratio * 100 };
}

export function addBossDamage(boss: BossState, damage: number): BossState {
  if (!Number.isSafeInteger(damage) || damage < 0) throw new Error('Boss伤害必须为非负安全整数。');
  bossScore(boss);
  if (boss.hasContactedPlayer) return { ...boss };
  const accumulatedDamage = boss.accumulatedDamage + damage;
  if (!Number.isSafeInteger(accumulatedDamage)) throw new Error('Boss累计伤害超出安全整数范围。');
  return { ...boss, accumulatedDamage };
}

export function bossSucceeded(boss: BossState): boolean {
  bossScore(boss);
  return boss.accumulatedDamage >= boss.baseMaxHp;
}
