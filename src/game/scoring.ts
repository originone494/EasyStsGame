import type { BattleState, EnemyScoreRecord, EnemyState, ScoreSummary } from './model';

export function createScoring(enemies: readonly Pick<EnemyState, 'id' | 'maxHp'>[]): EnemyScoreRecord[] {
  const ids = new Set<number>();
  const records = enemies.map(enemy => {
    if (ids.has(enemy.id) || !Number.isSafeInteger(enemy.id) || enemy.id < 0 || !Number.isSafeInteger(enemy.maxHp) || enemy.maxHp <= 0) throw new Error('计分怪物编号或最大生命无效。');
    ids.add(enemy.id);
    return { id: enemy.id, maxHp: enemy.maxHp, hpLost: 0, disposition: 'active' as const };
  });
  summarizeScore(records);
  return records;
}

function recordFor(s: Pick<BattleState, 'scoring'>, enemy: Pick<EnemyState, 'id' | 'maxHp'>): EnemyScoreRecord {
  let record = s.scoring.find(item => item.id === enemy.id);
  if (!record) {
    // A development fixture may introduce a unit after initialization. Preserve
    // its first observed scoring maximum instead of dropping its actual loss.
    record = createScoring([enemy])[0];
    summarizeScore([...s.scoring, record]);
    s.scoring.push(record);
  }
  return record;
}

export function recordEnemyHpLoss(s: Pick<BattleState, 'scoring'>, enemy: Pick<EnemyState, 'id' | 'maxHp'>, amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('有效生命损失必须为非负安全整数。');
  const record = recordFor(s, enemy);
  record.hpLost += Math.min(amount, record.maxHp - record.hpLost);
}

export function recordEnemyRemoval(s: Pick<BattleState, 'scoring'>, enemy: Pick<EnemyState, 'id' | 'maxHp'>, reason: 'killed' | 'contact') {
  recordFor(s, enemy).disposition = reason;
}

export function summarizeScore(records: readonly EnemyScoreRecord[]): ScoreSummary {
  let hpLost = 0, maxHp = 0;
  for (const record of records) {
    if (!Number.isSafeInteger(record.maxHp) || record.maxHp <= 0 || !Number.isSafeInteger(record.hpLost) || record.hpLost < 0) throw new Error('计分记录无效。');
    maxHp += record.maxHp; hpLost += Math.min(record.hpLost, record.maxHp);
    if (!Number.isSafeInteger(maxHp) || !Number.isSafeInteger(hpLost)) throw new Error('计分总生命超出可精确表示范围。');
  }
  const ratio = maxHp ? Math.max(0, Math.min(1, hpLost / maxHp)) : 0;
  return { hpLost, maxHp, ratio, percent: ratio * 100 };
}
