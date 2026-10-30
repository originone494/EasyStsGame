import type { BattleState, DamageTerm, GameEvent, ListenerDefinition, ListenerState, TriggerAmount, TriggerCondition, TriggerEffect } from './model';

export function registerListener(s: BattleState, definition: ListenerDefinition): number {
  if (definition.kind === 'temporary' && definition.snapshot !== 'eventStart' && definition.snapshot !== 'execution') {
    throw new Error('临时监听必须显式指定快照策略。');
  }
  if (definition.limit.scope !== 'unlimited' && (!Number.isSafeInteger(definition.limit.count) || definition.limit.count < 1)) {
    throw new Error('监听次数限制必须为正整数。');
  }
  // No functions or live configuration references are stored in battle state.
  const id = s.nextListenerId++;
  s.listeners.push({ id, order: s.nextListenerOrder++, definition: structuredClone(definition), active: true,
    registeredTurn: s.turn, totalTriggers: 0, turnTriggers: 0, lastTriggerTurn: 0 });
  return id;
}

export function setListenerActive(s: BattleState, id: number, active: boolean) {
  const listener = s.listeners.find(item => item.id === id);
  if (!listener || listener.active === active) return;
  // Relics retain acquisition order. Temporary effects re-register when re-enabled.
  if (active && listener.definition.kind === 'temporary') {
    listener.order = s.nextListenerOrder++;
    listener.registeredTurn = s.turn;
  }
  listener.active = active;
}

export function expireListeners(s: BattleState) {
  for (const listener of s.listeners) {
    if (listener.definition.duration === 'turn' && listener.registeredTurn < s.turn) listener.active = false;
  }
}

function matches(s: BattleState, event: GameEvent, condition?: TriggerCondition): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case 'always': return true;
    case 'missingHpAtLeast': return s.player.maxHp - s.player.hp >= condition.value;
    case 'eventValueAtLeast': return event.value >= condition.value;
    case 'sourceKind': return event.source.kind === condition.kind;
    case 'targetKind': return event.target?.kind === condition.kind;
    case 'damageKind': return event.damage?.kind === condition.kind;
    case 'hpLossCause': return event.hpLossCause === condition.cause;
    case 'all': return condition.conditions.every(part => matches(s, event, part));
  }
}

export function eligible(s: BattleState, event: GameEvent, listener: ListenerState): boolean {
  const d = listener.definition;
  if (!listener.active || !event.allowChain || !d.listensTo.includes(event.type)) return false;
  if (d.limit.scope === 'battle' && listener.totalTriggers >= d.limit.count) return false;
  if (d.limit.scope === 'turn' && listener.lastTriggerTurn === s.turn && listener.turnTriggers >= d.limit.count) return false;
  return matches(s, event, d.condition);
}

export interface FrozenEffect { effect: TriggerEffect; base?: number; targetHp?: number; multiplier?: number; damageBase?: number; damageTerms?: DamageTerm[] }
export function freezeAmount(s: BattleState, event: GameEvent, amount: TriggerAmount) {
  if (typeof amount === 'number') return { base: amount, targetHp: 0, multiplier: 1, damageBase: amount, damageTerms: [] };
  const damageTerms = [
    { value: s.player.maxHp - s.player.hp, coefficient: amount.missingHp ?? 0 },
    { value: event.value, coefficient: amount.eventValue ?? 0 },
  ].filter(term => term.coefficient !== 0);
  return {
    base: (amount.base ?? 0) + (amount.missingHp ?? 0) * (s.player.maxHp - s.player.hp) + (amount.eventValue ?? 0) * event.value,
    targetHp: amount.targetHp ?? 0, multiplier: amount.multiplier ?? 1,
    damageBase: amount.base ?? 0, damageTerms,
  };
}
export function freezeEffects(s: BattleState, event: GameEvent, definition: ListenerDefinition): FrozenEffect[] {
  return definition.effects.map(effect => effect.type === 'setListenerActive' || effect.type === 'listen'
    ? { effect: structuredClone(effect) }
    : { effect: structuredClone(effect), ...freezeAmount(s, event, effect.amount) });
}
