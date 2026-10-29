import type { State, Enemy } from './state';
import { damagePlayer } from './resolution';
export function canMove(s: State, direction: number, amount = 1) {
  const end = s.player.position + direction * amount;
  return (direction === -1 || direction === 1) && end >= 0 && end < s.size && !s.enemies.some(e => e.position === end);
}
export function movePlayer(s: State, direction: number, amount: number) {
  s.player.position += direction * amount; s.events.push({ type: 'move', amount: direction * amount }); s.log.push(`队伍${direction < 0 ? '向左' : '向右'}移动 ${amount} 格。`);
}
export function pushEnemy(s: State, id: number, amount: number) {
  let current = s.enemies.find(e => e.id === id); if (!current) return;
  const direction = Math.sign(current.position - s.player.position);
  let remaining = amount;
  while (current && remaining > 0) {
    const next: number = current.position + direction;
    if (next < 0 || next >= s.size) { s.log.push(`敌人 #${current.id} 到达边界，剩余 ${remaining} 格击退消失。`); break; }
    const blocker: Enemy | undefined = s.enemies.find(e => e.position === next);
    if (blocker) { s.events.push({ type: 'collision', actor: current.id, target: blocker.id, amount: remaining }); s.log.push(`碰撞：#${current.id} → #${blocker.id}，传递 ${remaining} 格击退（无伤害）。`); current = blocker; }
    else { current.position = next; remaining--; s.events.push({ type: 'move', actor: current.id, amount: direction }); s.log.push(`敌人 #${current.id} 被击退至第 ${next} 格。`); }
  }
}
export function advanceEnemy(s: State, id: number) {
  const enemy = s.enemies.find(e => e.id === id); if (!enemy || s.status !== 'playing') return;
  for (let step = 0; step < enemy.speed; step++) {
    const next = enemy.position + Math.sign(s.player.position - enemy.position);
    if (next === s.player.position) { s.log.push(`敌人 #${id} 尝试进入队伍格，接触后消失。`); s.enemies = s.enemies.filter(e => e.id !== id); damagePlayer(s, enemy.damage); return; }
    if (s.enemies.some(e => e.id !== id && e.position === next)) { s.log.push(`敌人 #${id} 受阻，剩余移动作废。`); return; }
    enemy.position = next; s.events.push({ type: 'move', actor: id, amount: 1 }); s.log.push(`敌人 #${id} 前进至第 ${next} 格。`);
  }
}
