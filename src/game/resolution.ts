import type { State } from './state';
export function damageEnemy(s: State, id: number, amount: number) {
  const enemy = s.enemies.find(e => e.id === id); if (!enemy || s.status === 'lost') return;
  enemy.hp = Math.max(0, enemy.hp - amount); s.events.push({ type: 'damage', target: id, amount });
  s.log.push(`敌人 #${id} 受到 ${amount} 点伤害，剩余 ${enemy.hp} 生命。`);
  if (enemy.hp === 0) { s.enemies = s.enemies.filter(e => e.id !== id); s.events.push({ type: 'death', target: id }); s.log.push(`敌人 #${id} 被击杀。`); }
}
export function damagePlayer(s: State, amount: number) {
  s.player.hp = Math.max(0, s.player.hp - amount); s.events.push({ type: 'damage', amount }); s.log.push(`队伍受到 ${amount} 点伤害，生命 ${s.player.hp}。`);
  if (s.player.hp === 0) { s.status = 'lost'; s.log.push('共享生命归零，战斗失败。'); }
}
export function settle(s: State) {
  if (s.status === 'playing' && !s.enemies.length && !s.executing.length) { s.status = 'won'; s.log.push('全部敌人已移除，当前卡牌收尾完成。战斗胜利！'); }
}
