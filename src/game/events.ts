import type { BattleState, BattleEvent, DamageResult, EntityRef, EventContext, EventType, FinishReason, GameEvent } from './model';

export const playerRef = { kind: 'player', id: 0 } as const;
const systemContext: EventContext = { source: { kind: 'system', id: 'battle' }, parentId: null, allowChain: true };

export function recordEvent(s: BattleState, type: EventType,
  data: { target?: EntityRef; value?: number; parentId?: number; actor?: EntityRef;
    batchId?: number; damage?: DamageResult; hpLossCause?: 'damage' | 'direct' } = {}, legacy?: BattleEvent): GameEvent | undefined {
  if (s.status !== 'playing') return;
  const id = s.nextEventId++;
  const event: GameEvent = {
    ...structuredClone(s.eventContext ?? systemContext), id, sequence: id, type,
    target: data.target ? structuredClone(data.target) : null, value: data.value ?? 0,
    actor: data.actor ? structuredClone(data.actor) : null,
  };
  if (data.parentId !== undefined) event.parentId = data.parentId;
  if (data.batchId !== undefined) event.batchId = data.batchId;
  if (data.damage) event.damage = structuredClone(data.damage);
  if (data.hpLossCause) event.hpLossCause = data.hpLossCause;
  s.eventHistory.push(event);
  s.eventQueue.push(event);
  if (legacy) s.events.push(legacy);
  s.eventTrace.push({ kind: 'enqueue', eventId: id, message: type });
  return event;
}

export function withEventContext<T>(s: BattleState, context: EventContext, run: () => T): T {
  const previous = s.eventContext;
  s.eventContext = context;
  try { return run(); } finally { s.eventContext = previous; }
}

export function finishBattle(s: BattleState, status: 'won' | 'lost', reason: FinishReason) {
  if (s.status !== 'playing') return;
  s.status = status; s.phase = 'finished'; s.finishReason = reason; s.lastKillPending = false;
  for (const event of s.eventQueue) s.eventTrace.push({ kind: 'cancel', eventId: event.id, message: reason });
  s.eventQueue = [];
  s.eventTrace.push({ kind: 'finish', message: `${status}: ${reason}` });
  s.log.push(reason === 'boss-contact' ? `Boss接触，输出${status === 'won' ? '达标，战斗胜利' : '未达标，战斗失败'}！`
    : status === 'lost' ? '共享生命归零，战斗失败。'
    : reason === 'last-contact' ? '最后怪物接触消失，队伍存活，战斗胜利！'
    : '全部敌人已移除，当前卡牌及触发收尾完成。战斗胜利！');
}
