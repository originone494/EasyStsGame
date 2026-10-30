import type { State } from './state';
import { cards } from '../content/cards';
import { canMove } from './movement';
import { executeCard } from './cards';
import { settle } from './resolution';
import { finishTurn } from './turn';
import { playerRef, recordEvent, withEventContext } from './events';
import { processEvents } from './eventQueue';
export type Action = { type: 'play'; cardId: number; target?: number; direction?: number } | { type: 'endTurn' };
export function act(state: State, action: Action): State {
  const s = structuredClone(state); s.notice = '';
  const reject = (message: string) => { s.notice = message; return s; };
  if (s.status !== 'playing' || s.phase !== 'player' || s.lastKillPending || s.processingEvents) return reject('当前不能操作，请重新开始。');
  if (action.type === 'endTurn') { finishTurn(s); return s; }
  const card = s.hand.find(c => c.id === action.cardId); if (!card) return reject('这张牌不在手牌中。');
  const def = cards[card.key];
  if (def.target === 'enemy' && !s.enemies.some(e => e.id === action.target)) return reject('请先选择一个存活的敌人。');
  if (def.target === 'direction') {
    const move = def.effects.find(e => e.type === 'move');
    if (!canMove(s, action.direction ?? 0, move?.type === 'move' ? move.amount : 1)) return reject('移动终点被占据或超出边界，请选择其他方向。');
  }
  s.phase = 'card';
  s.hand = s.hand.filter(c => c.id !== card.id); s.executing.push(card); s.log.push(`打出「${def.name}」。`);
  const source = { kind: 'card', id: card.id, key: card.key } as const;
  withEventContext(s, { source, parentId: null, allowChain: true }, () => {
    const played = recordEvent(s, 'CARD_PLAYED', { target: def.target === 'enemy' ? { kind: 'enemy', id: action.target! } : playerRef });
    withEventContext(s, { source, parentId: played!.id, allowChain: true }, () => {
      executeCard(s, card, action.target, action.direction);
      // Preserve the prototype's timing: leave execution after direct effects,
      // before dispatch. Triggered draw may now recycle an ordinary used card.
      s.executing = s.executing.filter(c => c.id !== card.id);
      (def.exhaust ? s.exhaust : s.discard).push(card);
      if (def.exhaust) recordEvent(s, 'CARD_EXHAUSTED', { target: source, value: 1 });
    });
  });
  processEvents(s);
  settle(s);
  if (s.status === 'playing') s.phase = 'player';
  return s;
}
