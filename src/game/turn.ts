import type { State } from './state';
import { drawCards } from './cards';
import { advanceEnemy } from './movement';
import { settle } from './resolution';
import { recordEvent, withEventContext } from './events';
import { processEvents } from './eventQueue';
import { expireListeners } from './listeners';
import { updateWeatherForTurn } from './weather';
export function enemyOrder(s: State): number[] { return [...s.enemies].sort((a,b) => Math.abs(a.position-s.player.position)-Math.abs(b.position-s.player.position) || a.id-b.id).map(e => e.id); }
export function startPlayerTurn(s: State) {
  if (s.status !== 'playing') return;
  s.phase = 'player';
  expireListeners(s);
  updateWeatherForTurn(s);
  processEvents(s);
  if (s.status !== 'playing') return;
  withEventContext(s, { source: { kind: 'system', id: 'turn' }, parentId: null, allowChain: true }, () => recordEvent(s, 'TURN_STARTED', { value: s.turn }));
  processEvents(s);
  if (s.status !== 'playing') return;
  withEventContext(s, { source: { kind: 'system', id: 'refill' }, parentId: null, allowChain: true }, () => drawCards(s, Math.max(0, s.handSize - s.hand.length)));
  processEvents(s);
}
export function finishTurn(s: State) {
  if (s.status !== 'playing' || s.lastKillPending) return;
  s.discard.push(...s.hand); s.hand = []; s.phase = 'enemy';
  const order = enemyOrder(s); s.log.push(`怪物行动顺序：${order.map(id => '#' + id).join(' → ')}。`);
  for (const id of order) {
    if (s.status !== 'playing') break;
    withEventContext(s, { source: { kind: 'enemy', id }, parentId: null, allowChain: true }, () => advanceEnemy(s, id));
    processEvents(s);
  }
  settle(s); if (s.status !== 'playing') return;
  s.turn++; s.log.push(`回合 ${s.turn} 开始，补牌至 ${s.handSize} 张。`); startPlayerTurn(s);
}
