import type { BattleState, PushAccounting, PushBatchResult, PushDirection, PushEventDetail, PushRequest } from './model';
import { recordEvent } from './events';

interface Unit { id: number; position: number }
interface Collision {
  actor: number; target: number; amount: number; position: number;
  mode: 'transfer' | 'opposed' | 'converge'; direction?: -1 | 1;
  leftAmount?: number; rightAmount?: number; canceled?: number;
}
interface PushFrame {
  tick: number; positions: Unit[]; collisions: Collision[];
  moves: { id: number; from: number; to: number }[];
  stopped: { id: number; amount: number; reason: 'boundary' | 'player' }[];
}
export interface PushPlan extends PushAccounting {
  frames: PushFrame[]; requests: PushRequest[]; units: { id: number; from: number; to: number }[];
}

export function pushDirection(position: number, player: number, mode: PushDirection = 'away'): -1 | 1 {
  if (mode === 'left') return -1;
  if (mode === 'right') return 1;
  const direction = Math.sign(position - player) * (mode === 'toward' ? -1 : 1);
  if (!direction) throw new Error('击退单位不能与队伍重叠。');
  return direction as -1 | 1;
}

const totalForce = (forces: Map<number, number>) => [...forces.values()].reduce((sum, value) => sum + Math.abs(value), 0);

// Pure planner: validate and solve completely before touching battle state.
export function planPushes(size: number, player: number, input: readonly Unit[], requests: readonly PushRequest[]): PushPlan {
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(player) || player < 0 || player >= size) throw new Error('击退战场配置无效。');
  const units = input.map(({ id, position }) => ({ id, position })).sort((a, b) => a.id - b.id);
  const byId = new Map<number, Unit>();
  const positions = new Set([player]);
  for (const unit of units) {
    if (!Number.isSafeInteger(unit.id) || unit.id < 0 || byId.has(unit.id) || !Number.isSafeInteger(unit.position)
      || unit.position < 0 || unit.position >= size || positions.has(unit.position)) throw new Error('击退单位编号或位置无效／重叠。');
    byId.set(unit.id, unit); positions.add(unit.position);
  }
  const initialPositions = new Map(units.map(unit => [unit.id, unit.position]));
  const seen = new Set<number>();
  const locked: PushRequest[] = [];
  let initial = 0;
  for (const request of requests) {
    if (!Number.isSafeInteger(request.amount) || request.amount < 0 || (request.direction !== -1 && request.direction !== 1)) throw new Error('击退量必须为非负安全整数，方向必须为-1或1。');
    if (!byId.has(request.id)) continue;
    if (seen.has(request.id)) throw new Error('同一同步击退批次不能重复指定同一目标。');
    seen.add(request.id);
    initial += request.amount;
    if (!Number.isSafeInteger(initial)) throw new Error('击退总量超出可精确表示范围。');
    if (request.amount) locked.push({ ...request });
  }
  locked.sort((a, b) => a.id - b.id);
  let forces = new Map(units.map(unit => [unit.id, 0]));
  for (const request of locked) forces.set(request.id, request.amount * request.direction);
  let moved = 0, canceled = 0, boundaryLost = 0, playerBlocked = 0;
  const frames: PushFrame[] = [];
  while (totalForce(forces)) {
    const frame: PushFrame = { tick: frames.length + 1, positions: [], collisions: [], moves: [], stopped: [] };
    const occupancy = new Map(units.map(unit => [unit.position, unit]));
    const contacts = new Map<string, Collision>();
    const collide = (collision: Collision) => {
      const key = `${collision.mode}:${collision.actor}:${collision.target}`;
      const previous = contacts.get(key);
      if (!previous) contacts.set(key, collision);
      else {
        previous.amount += collision.amount;
        if (collision.leftAmount !== undefined) previous.leftAmount = (previous.leftAmount ?? 0) + collision.leftAmount;
        if (collision.rightAmount !== undefined) previous.rightAmount = (previous.rightAmount ?? 0) + collision.rightAmount;
        if (collision.canceled !== undefined) previous.canceled = (previous.canceled ?? 0) + collision.canceled;
      }
    };
    // Propagate impulses over occupied cells. Opposed adjacent impulses cancel
    // rather than swapping owners and bouncing forever. No arbitrary step cap.
    while (true) {
      for (const unit of units) {
        const force = forces.get(unit.id)!;
        if (!force) continue;
        const next = unit.position + Math.sign(force);
        if (next < 0 || next >= size || next === player) {
          const amount = Math.abs(force), reason = next === player ? 'player' : 'boundary';
          if (reason === 'player') playerBlocked += amount; else boundaryLost += amount;
          frame.stopped.push({ id: unit.id, amount, reason }); forces.set(unit.id, 0);
        }
      }
      const outgoing = new Set<number>();
      const incoming = new Map<number, number[]>();
      const give = (id: number, force: number) => { if (force) incoming.set(id, [...incoming.get(id) ?? [], force]); };
      for (const left of units) {
        const a = forces.get(left.id)!;
        if (a <= 0) continue;
        const right = occupancy.get(left.position + 1);
        if (!right) continue;
        const b = forces.get(right.id)!;
        if (b >= 0) continue;
        outgoing.add(left.id); outgoing.add(right.id);
        const loss = 2 * Math.min(a, -b), net = a + b;
        canceled += loss;
        if (net > 0) give(right.id, net); else if (net < 0) give(left.id, net);
        collide({ actor: left.id, target: right.id, amount: a - b, position: left.position + 0.5,
          mode: 'opposed', leftAmount: a, rightAmount: -b, canceled: loss });
      }
      for (const unit of units) {
        const force = forces.get(unit.id)!;
        if (!force || outgoing.has(unit.id)) continue;
        const blocker = occupancy.get(unit.position + Math.sign(force));
        if (!blocker) continue;
        outgoing.add(unit.id); give(blocker.id, force);
        collide({ actor: unit.id, target: blocker.id, amount: Math.abs(force), position: blocker.position,
          mode: 'transfer', direction: Math.sign(force) as -1 | 1 });
      }
      if (!outgoing.size) break;
      for (const unit of units) if (!outgoing.has(unit.id)) give(unit.id, forces.get(unit.id)!);
      const nextForces = new Map<number, number>();
      for (const unit of units) {
        const values = incoming.get(unit.id) ?? [];
        const net = values.reduce((sum, value) => sum + value, 0);
        canceled += values.reduce((sum, value) => sum + Math.abs(value), 0) - Math.abs(net);
        nextForces.set(unit.id, net);
      }
      forces = nextForces;
    }
    // Two units may now request the same empty cell. Cancel the opposing part
    // before committing movement; ties stay put and never overlap or cross.
    const proposals = new Map<number, Unit[]>();
    for (const unit of units) {
      const force = forces.get(unit.id)!;
      if (force) {
        const next = unit.position + Math.sign(force);
        proposals.set(next, [...proposals.get(next) ?? [], unit]);
      }
    }
    for (const [position, contenders] of proposals) {
      if (contenders.length < 2) continue;
      const [left, right] = contenders.sort((a, b) => a.position - b.position);
      const a = forces.get(left.id)!, b = forces.get(right.id)!;
      const loss = 2 * Math.min(a, -b), net = a + b;
      canceled += loss;
      forces.set(left.id, net > 0 ? net : 0); forces.set(right.id, net < 0 ? net : 0);
      collide({ actor: left.id, target: right.id, amount: a - b, position, mode: 'converge', leftAmount: a, rightAmount: -b, canceled: loss });
    }
    for (const unit of units) {
      const force = forces.get(unit.id)!;
      if (!force) continue;
      const from = unit.position, direction = Math.sign(force);
      unit.position += direction; forces.set(unit.id, force - direction); moved++;
      frame.moves.push({ id: unit.id, from, to: unit.position });
    }
    const occupied = new Set([player]);
    for (const unit of units) {
      if (unit.position < 0 || unit.position >= size || occupied.has(unit.position)) throw new Error('同步击退产生非法位置。');
      occupied.add(unit.position);
    }
    if (initial !== moved + canceled + boundaryLost + playerBlocked + totalForce(forces)) throw new Error('同步击退位移总量不守恒。');
    frame.positions = units.map(unit => ({ ...unit }));
    frame.collisions = [...contacts.values()].sort((a, b) => a.position - b.position || a.actor - b.actor || a.target - b.target || a.mode.localeCompare(b.mode));
    frame.moves.sort((a, b) => a.from - b.from || a.id - b.id);
    frames.push(frame);
  }
  return { initial, moved, canceled, boundaryLost, playerBlocked, remaining: 0, frames, requests: locked,
    units: units.map(unit => ({ id: unit.id, from: initialPositions.get(unit.id)!, to: unit.position })) };
}

export function resolvePushBatch(s: BattleState, requests: readonly PushRequest[]): PushBatchResult | undefined {
  if (s.status !== 'playing') return;
  const plan = planPushes(s.size, s.player.position, s.enemies, requests);
  if (!plan.initial) return;
  const batchId = s.nextPushBatchId++;
  for (const frame of plan.frames) {
    const positions = new Map(frame.positions.map(unit => [unit.id, unit.position]));
    // Replace the whole array to avoid exposing partially committed positions.
    s.enemies = s.enemies.map(unit => ({ ...unit, position: positions.get(unit.id)! }));
    for (const collision of frame.collisions) {
      const { actor, target, amount, ...detail } = collision;
      const push: PushEventDetail = { ...detail, batchId, tick: frame.tick };
      recordEvent(s, 'COLLISION', { actor: { kind: 'enemy', id: actor }, target: { kind: 'enemy', id: target }, value: amount, push },
        { type: 'collision', actor, target, amount });
      s.log.push(`碰撞：#${actor} → #${target}，位移量 ${amount}（无伤害）。`);
    }
    for (const move of frame.moves) {
      const direction = (move.to - move.from) as -1 | 1;
      recordEvent(s, 'UNIT_MOVED', { target: { kind: 'enemy', id: move.id }, value: direction,
        push: { batchId, tick: frame.tick, mode: 'move', direction, from: move.from, to: move.to, position: move.to } },
        { type: 'move', actor: move.id, amount: direction });
      s.log.push(`敌人 #${move.id} 被击退至第 ${move.to} 格。`);
    }
    for (const stop of frame.stopped) s.log.push(`敌人 #${stop.id} ${stop.reason === 'boundary' ? '到达边界' : '受队伍格阻挡'}，剩余 ${stop.amount} 格击退消失。`);
  }
  const { frames, ...accounting } = plan;
  const result: PushBatchResult = { ...accounting, batchId, ticks: frames.length };
  s.pushHistory.push(result);
  return result;
}
