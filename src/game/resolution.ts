import type { State } from './state';
import type { DamageOptions } from './model';
import { finishBattle, playerRef, recordEvent } from './events';
import { inferDamageKind, resolveDamageBatch } from './damage';
export function damageEnemy(s: State, id: number, amount: number, options: DamageOptions = {}) {
  return resolveDamageBatch(s, [{ target: { kind: 'enemy', id }, base: amount,
    kind: options.kind ?? inferDamageKind(s), flat: options.flat, multipliers: options.multipliers, percentBonuses: options.percentBonuses, baseTerms: options.baseTerms }]);
}
export function damageEnemies(s: State, ids: readonly number[], amount: number, options: DamageOptions = {}) {
  return resolveDamageBatch(s, [...new Set(ids)].map(id => ({ target: { kind: 'enemy', id }, base: amount,
    kind: options.kind ?? inferDamageKind(s), flat: options.flat, multipliers: options.multipliers, percentBonuses: options.percentBonuses, baseTerms: options.baseTerms })));
}
export function damagePlayer(s: State, amount: number, options: DamageOptions = {}) {
  return resolveDamageBatch(s, [{ target: playerRef, base: amount,
    kind: options.kind ?? inferDamageKind(s), flat: options.flat, multipliers: options.multipliers, percentBonuses: options.percentBonuses, baseTerms: options.baseTerms }]);
}
export function losePlayerHp(s: State, amount: number) {
  if (s.status !== 'playing') return;
  const before = s.player.hp;
  s.player.hp = Math.max(0, before - Math.max(0, amount));
  if (s.player.hp < before) recordEvent(s, 'HP_LOST', { target: playerRef, value: before - s.player.hp, hpLossCause: 'direct' });
  s.log.push(`队伍失去 ${before - s.player.hp} 点生命。`);
  if (s.player.hp === 0) finishBattle(s, 'lost', 'player-death');
}
export function healPlayer(s: State, amount: number) {
  if (s.status !== 'playing') return;
  const before = s.player.hp;
  s.player.hp = Math.min(s.player.maxHp, before + Math.max(0, amount));
  recordEvent(s, 'HEALED', { target: playerRef, value: s.player.hp - before }, { type: 'heal', amount: s.player.hp - before });
  s.log.push(`队伍恢复 ${s.player.hp - before} 点生命。`);
}
export function settle(s: State) {
  if (s.status === 'playing' && !s.boss && !s.enemies.length && !s.executing.length && !s.processingEvents && !s.eventQueue.length) {
    finishBattle(s, 'won', 'last-kill');
  }
}
