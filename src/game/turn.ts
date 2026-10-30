import type { State } from './state';
import { drawCards } from './cards';
import { advanceEnemy } from './movement';
import { settle } from './resolution';
export function enemyOrder(s: State): number[] { return [...s.enemies].sort((a,b) => Math.abs(a.position-s.player.position)-Math.abs(b.position-s.player.position) || a.id-b.id).map(e => e.id); }
export function finishTurn(s: State) {
  s.discard.push(...s.hand); s.hand = []; s.phase = 'enemy';
  const order = enemyOrder(s); s.log.push(`怪物行动顺序：${order.map(id => '#' + id).join(' → ')}。`);
  for (const id of order) { if (s.status !== 'playing') break; advanceEnemy(s, id); }
  settle(s); if (s.status !== 'playing') return;
  s.phase = 'player'; s.turn++; s.log.push(`回合 ${s.turn} 开始，补牌至 ${s.handSize} 张。`); drawCards(s, Math.max(0, s.handSize - s.hand.length));
}
