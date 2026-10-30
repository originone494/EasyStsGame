import type { BattleState, EnemyState, GameEvent, TriggerTarget } from './model';
import { withEventContext } from './events';
import { eligible, freezeEffects, registerListener, setListenerActive, type FrozenEffect } from './listeners';
import { damageEnemy, healPlayer, losePlayerHp, settle } from './resolution';
import { drawCards } from './cards';
import { pushEnemy } from './movement';
import { nextRandom } from './random';
import { inferDamageKind, resolveDamageBatch } from './damage';
import { pushDirection, resolvePushBatch } from './push';

function selectTarget(s: BattleState, event: GameEvent, target: TriggerTarget): EnemyState | undefined {
  if (target === 'eventTarget') return event.target?.kind === 'enemy' ? s.enemies.find(enemy => enemy.id === event.target!.id) : undefined;
  const targets = [...s.enemies].sort((a, b) => a.id - b.id);
  if (!targets.length) return;
  if (target === 'random') {
    s.rng = nextRandom(s.rng);
    return targets[Math.floor(s.rng / 4294967296 * targets.length)];
  }
  return targets.sort((a, b) => target === 'lowestHp' ? a.hp - b.hp || a.id - b.id
    : Math.abs(a.position - s.player.position) - Math.abs(b.position - s.player.position) || a.id - b.id)[0];
}

function executeEffects(s: BattleState, event: GameEvent, listenerId: number, effects: FrozenEffect[]) {
  for (const frozen of effects) {
    if (s.status !== 'playing') return;
    const effect = frozen.effect;
    if (effect.type === 'listen') {
      registerListener(s, effect.listener);
      continue;
    }
    if (effect.type === 'setListenerActive') {
      setListenerActive(s, effect.listenerId === 'self' ? listenerId : effect.listenerId, effect.active);
      continue;
    }
    if (effect.type === 'pushGroup') {
      resolvePushBatch(s, effect.pushes);
      continue;
    }
    if (effect.type === 'pushAll') {
      resolvePushBatch(s, s.enemies.map(enemy => ({ id: enemy.id,
        amount: Math.max(0, Math.ceil((frozen.base! + frozen.targetHp! * enemy.hp) * frozen.multiplier!)),
        direction: pushDirection(enemy.position, s.player.position, effect.direction) })));
      continue;
    }
    if (effect.type === 'damageAll') {
      // Build all target-dependent bases against the same pre-batch state.
      resolveDamageBatch(s, s.enemies.map(enemy => ({ target: { kind: 'enemy', id: enemy.id },
        base: frozen.damageBase!, flat: effect.flat,
        baseTerms: [...frozen.damageTerms!, { value: enemy.hp, coefficient: frozen.targetHp! }],
        multipliers: [...effect.multipliers ?? [], frozen.multiplier!], percentBonuses: effect.percentBonuses, kind: inferDamageKind(s) })));
      continue;
    }
    const target = effect.type === 'damage' || effect.type === 'push' ? selectTarget(s, event, effect.target) : undefined;
    if ((effect.type === 'damage' || effect.type === 'push') && !target) {
      s.eventTrace.push({ kind: 'skip', eventId: event.id, listenerId, message: '没有合法目标；继续独立效果' });
      continue;
    }
    const base = frozen.base! + frozen.targetHp! * (target?.hp ?? 0);
    if (effect.type === 'damage') {
      damageEnemy(s, target!.id, frozen.damageBase!, { flat: effect.flat,
        baseTerms: [...frozen.damageTerms!, { value: target!.hp, coefficient: frozen.targetHp! }],
        multipliers: [...effect.multipliers ?? [], frozen.multiplier!], percentBonuses: effect.percentBonuses, kind: inferDamageKind(s) });
      continue;
    }
    const amount = Math.max(0, Math.ceil(base * frozen.multiplier!));
    switch (effect.type) {
      case 'push': pushEnemy(s, target!.id, amount, effect.direction); break;
      case 'heal': healPlayer(s, amount); break;
      case 'draw': drawCards(s, amount); break;
      case 'loseHp': losePlayerHp(s, amount); break;
    }
  }
}

export function processEvents(s: BattleState) {
  // No recursive dispatch: emitted facts are appended to the queue's tail.
  if (s.processingEvents || s.status !== 'playing') return;
  const resumePhase = s.phase;
  s.processingEvents = true;
  s.phase = s.lastKillPending ? 'closing' : 'events';
  try {
    while (s.eventQueue.length && s.status === 'playing') {
      const event = s.eventQueue.shift()!;
      s.eventTrace.push({ kind: 'dequeue', eventId: event.id, message: event.type });
      // Lock ALL relic qualifications and non-target values before any response.
      const snapshots = [...s.listeners].sort((a, b) => a.order - b.order).map(listener => {
        const deferred = listener.definition.kind === 'temporary' && listener.definition.snapshot === 'execution';
        const qualifies = eligible(s, event, listener);
        const effects = !deferred && qualifies ? freezeEffects(s, event, listener.definition) : [];
        if (listener.definition.listensTo.includes(event.type)) {
          s.eventTrace.push({ kind: 'snapshot', eventId: event.id, listenerId: listener.id,
            message: deferred ? '临时监听：按显式execution策略延迟判断' : qualifies ? '资格与非目标数值已锁定' : '本事件不满足资格',
            values: effects.filter(item => item.base !== undefined).map(item => item.base!) });
        }
        return { listener, deferred, qualifies, effects };
      });
      for (const snapshot of snapshots) {
        if (s.status !== 'playing') break;
        const { listener, deferred } = snapshot;
        if (!(deferred ? eligible(s, event, listener) : snapshot.qualifies)) continue;
        const effects = deferred ? freezeEffects(s, event, listener.definition) : snapshot.effects;
        if (listener.lastTriggerTurn !== s.turn) { listener.lastTriggerTurn = s.turn; listener.turnTriggers = 0; }
        listener.turnTriggers++; listener.totalTriggers++;
        s.eventTrace.push({ kind: 'trigger', eventId: event.id, listenerId: listener.id, message: listener.definition.name });
        withEventContext(s, { source: { kind: listener.definition.kind, id: listener.id, key: listener.definition.key }, parentId: event.id, allowChain: listener.definition.allowChain },
          () => executeEffects(s, event, listener.id, effects));
      }
    }
  } finally {
    s.processingEvents = false;
    if (s.status === 'playing') s.phase = s.lastKillPending ? 'closing' : resumePhase;
  }
  settle(s);
}
