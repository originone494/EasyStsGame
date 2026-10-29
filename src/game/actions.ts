import type { State } from './state';
import { cards } from '../content/cards';
import { canMove } from './movement';
import { executeCard } from './cards';
import { settle } from './resolution';
import { finishTurn } from './turn';
export type Action = { type: 'play'; cardId: number; target?: number; direction?: number } | { type: 'endTurn' };
export function act(state: State, action: Action): State {
  const s = structuredClone(state); s.notice = '';
  const reject = (message: string) => { s.notice = message; return s; };
  if (s.status !== 'playing' || s.phase !== 'player') return reject('当前不能操作，请重新开始。');
  if (action.type === 'endTurn') { finishTurn(s); return s; }
  const card = s.hand.find(c => c.id === action.cardId); if (!card) return reject('这张牌不在手牌中。');
  const def = cards[card.key];
  if (def.target === 'enemy' && !s.enemies.some(e => e.id === action.target)) return reject('请先选择一个存活的敌人。');
  if (def.target === 'direction') {
    const move = def.effects.find(e => e.type === 'move');
    if (!canMove(s, action.direction ?? 0, move?.amount ?? 1)) return reject('移动终点被占据或超出边界，请选择其他方向。');
  }
  s.hand = s.hand.filter(c => c.id !== card.id); s.executing.push(card); s.log.push(`打出「${def.name}」。`);
  executeCard(s, card, action.target, action.direction);
  s.executing = s.executing.filter(c => c.id !== card.id); (def.exhaust ? s.exhaust : s.discard).push(card);
  settle(s); return s;
}
