import type { State } from './state';
import { finishBattle, playerRef, recordEvent } from './events';
export function damageEnemy(s: State, id: number, amount: number) {
  const enemy = s.enemies.find(e => e.id === id); if (!enemy || s.status !== 'playing') return;
  amount = Math.max(0, amount);
  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - amount);
  const target = { kind: 'enemy', id } as const;
  const damage = recordEvent(s, 'DAMAGE_RESOLVED', { target, value: amount }, { type: 'damage', target: id, amount });
  if (enemy.hp < before) recordEvent(s, 'HP_LOST', { target, value: before - enemy.hp, parentId: damage!.id });
  s.log.push(`敌人 #${id} 受到 ${amount} 点伤害，剩余 ${enemy.hp} 生命。`);
  if (enemy.hp === 0) {
    s.enemies = s.enemies.filter(e => e.id !== id);
    recordEvent(s, 'ENEMY_DIED', { target, parentId: damage!.id }, { type: 'death', target: id });
    s.log.push(`敌人 #${id} 被击杀。`);
    if (!s.enemies.length) { s.lastKillPending = true; s.phase = 'closing'; }
  }
}
export function damagePlayer(s: State, amount: number) {
  if (s.status !== 'playing') return;
  amount = Math.max(0, amount);
  const before = s.player.hp;
  s.player.hp = Math.max(0, before - amount);
  const damage = recordEvent(s, 'DAMAGE_RESOLVED', { target: playerRef, value: amount }, { type: 'damage', amount });
  if (s.player.hp < before) recordEvent(s, 'HP_LOST', { target: playerRef, value: before - s.player.hp, parentId: damage!.id });
  s.log.push(`队伍受到 ${amount} 点伤害，生命 ${s.player.hp}。`);
  if (s.player.hp === 0) finishBattle(s, 'lost', 'player-death');
}
export function losePlayerHp(s: State, amount: number) {
  if (s.status !== 'playing') return;
  const before = s.player.hp;
  s.player.hp = Math.max(0, before - Math.max(0, amount));
  if (s.player.hp < before) recordEvent(s, 'HP_LOST', { target: playerRef, value: before - s.player.hp });
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
  if (s.status === 'playing' && !s.enemies.length && !s.executing.length && !s.processingEvents && !s.eventQueue.length) {
    finishBattle(s, 'won', 'last-kill');
  }
}
