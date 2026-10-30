import type { State } from './state';
import type { PushDirection } from './model';
import { damagePlayer } from './resolution';
import { finishBattle, playerRef, recordEvent } from './events';
import { pushDirection, resolvePushBatch } from './push';
export function canMove(s: State, direction: number, amount = 1) {
  const end = s.player.position + direction * amount;
  return (direction === -1 || direction === 1) && end >= 0 && end < s.size && !s.enemies.some(e => e.position === end);
}
export function movePlayer(s: State, direction: number, amount: number) {
  if (s.status !== 'playing' || !canMove(s, direction, amount)) return;
  s.player.position += direction * amount; recordEvent(s, 'UNIT_MOVED', { target: playerRef, value: direction * amount }, { type: 'move', amount: direction * amount }); s.log.push(`队伍${direction < 0 ? '向左' : '向右'}移动 ${amount} 格。`);
}
export function pushEnemy(s: State, id: number, amount: number, direction: PushDirection = 'away') {
  return pushEnemies(s, [id], amount, direction);
}
export function pushEnemies(s: State, ids: readonly number[], amount: number, direction: PushDirection = 'away') {
  if (s.status !== 'playing') return;
  const selected = new Set(ids);
  const targets = s.enemies.filter(unit => selected.has(unit.id));
  return resolvePushBatch(s, targets.map(unit => ({ id: unit.id, amount,
    direction: pushDirection(unit.position, s.player.position, direction) })));
}
export function advanceEnemy(s: State, id: number) {
  const enemy = s.enemies.find(e => e.id === id); if (!enemy || s.status !== 'playing') return;
  for (let step = 0; step < enemy.speed; step++) {
    const next = enemy.position + Math.sign(s.player.position - enemy.position);
    if (next === s.player.position) {
      s.log.push(`敌人 #${id} 尝试进入队伍格，接触后消失。`);
      recordEvent(s, 'ENEMY_CONTACT', { target: playerRef, value: enemy.damage });
      s.enemies = s.enemies.filter(e => e.id !== id); damagePlayer(s, enemy.damage, { kind: 'contact' });
      if (s.status === 'playing' && !s.enemies.length) finishBattle(s, 'won', 'last-contact');
      return;
    }
    if (s.enemies.some(e => e.id !== id && e.position === next)) { s.log.push(`敌人 #${id} 受阻，剩余移动作废。`); return; }
    const distance = next - enemy.position;
    enemy.position = next; recordEvent(s, 'UNIT_MOVED', { target: { kind: 'enemy', id }, value: distance }, { type: 'move', actor: id, amount: 1 }); s.log.push(`敌人 #${id} 前进至第 ${next} 格。`);
  }
}
