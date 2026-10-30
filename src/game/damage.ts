import type { BattleState, DamageKind, DamageModifiers, DamageRequest, DamageResult, DamageTerm, UnitRef } from './model';
import { finishBattle, recordEvent } from './events';
import { activeAdaptation } from './weather';

interface Fraction { numerator: bigint; denominator: bigint }

// Parse the decimal representation exactly. This avoids an extra point from
// e.g. Math.ceil(100 * 1.1), whose binary intermediate is 110.00000000000001.
function decimal(value: number): Fraction {
  if (!Number.isFinite(value)) throw new Error('伤害公式必须使用有限数值。');
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const numerator = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent);
  return scale >= 0 ? { numerator, denominator: 10n ** BigInt(scale) }
    : { numerator: numerator * 10n ** BigInt(-scale), denominator: 1n };
}

function add(a: Fraction, b: Fraction): Fraction {
  // Decimal denominators are powers of ten, so the larger divides both scales.
  const denominator = a.denominator > b.denominator ? a.denominator : b.denominator;
  return { numerator: a.numerator * (denominator / a.denominator) + b.numerator * (denominator / b.denominator), denominator };
}

function multiply(a: Fraction, b: Fraction): Fraction {
  return { numerator: a.numerator * b.numerator, denominator: a.denominator * b.denominator };
}

export function calculateDamage(base: number, modifiers: DamageModifiers = {}, baseTerms: readonly DamageTerm[] = []): number {
  let result = decimal(base);
  for (const term of baseTerms) result = add(result, multiply(decimal(term.value), decimal(term.coefficient)));
  for (const flat of modifiers.flat ?? []) result = add(result, decimal(flat));
  for (const multiplier of modifiers.multipliers ?? []) result = multiply(result, decimal(multiplier));
  // Percentage points form ONE exact factor (1 + points/100), without a
  // floating addition such as 1 + .14 becoming 1.1400000000000001.
  for (const percent of modifiers.percentBonuses ?? []) result = multiply(result, add(decimal(1), multiply(decimal(percent), decimal(0.01))));
  if (result.numerator <= 0n) return 0;
  const damage = (result.numerator + result.denominator - 1n) / result.denominator;
  if (damage > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('伤害结果超出可精确表示的整数范围。');
  return Number(damage);
}

export function inferDamageKind(s: BattleState): DamageKind {
  const source = s.eventContext?.source.kind;
  return source === 'card' ? 'card' : source === 'relic' ? 'relic' : source === 'enemy' ? 'contact' : 'indirect';
}

const sameTarget = (a: UnitRef, b: UnitRef) => a.kind === b.kind && a.id === b.id;

function applicableModifiers(s: BattleState, request: DamageRequest): DamageModifiers {
  const flat = [...request.flat ?? []], multipliers = [...request.multipliers ?? []], percentBonuses = [...request.percentBonuses ?? []];
  for (const modifier of s.damageModifiers) {
    if (modifier.kind && modifier.kind !== request.kind) continue;
    if (modifier.target && !sameTarget(modifier.target, request.target)) continue;
    flat.push(...modifier.flat ?? []); multipliers.push(...modifier.multipliers ?? []);
    percentBonuses.push(...modifier.percentBonuses ?? []);
  }
  if (request.kind === 'card') {
    const { points } = activeAdaptation(s);
    if (points) percentBonuses.push(points);
  }
  return { flat, multipliers, percentBonuses };
}

interface PreparedDamage { result: DamageResult; unit: { hp: number }; distance: number }

// Isolated policy: all damage facts, then actual HP loss, then deaths.
// This is the documented provisional cross-type order, not a final design ruling.
function recordBatchEvents(s: BattleState, prepared: PreparedDamage[]) {
  const parentIds = new Map<DamageResult, number>();
  for (const { result } of prepared) {
    const { target } = result;
    const legacy = target.kind === 'enemy' ? { type: 'damage' as const, target: target.id, amount: result.resolved }
      : { type: 'damage' as const, amount: result.resolved };
    const damage = recordEvent(s, 'DAMAGE_RESOLVED', { target, value: result.resolved, batchId: result.batchId, damage: result }, legacy)!;
    parentIds.set(result, damage.id);
    s.log.push(target.kind === 'enemy' ? `敌人 #${target.id} 受到 ${result.resolved} 点伤害，剩余 ${result.hpAfter} 生命。`
      : `队伍受到 ${result.resolved} 点伤害，生命 ${result.hpAfter}。`);
  }
  for (const { result } of prepared) {
    if (result.hpLost > 0) recordEvent(s, 'HP_LOST', { target: result.target, value: result.hpLost,
      batchId: result.batchId, damage: result, hpLossCause: 'damage', parentId: parentIds.get(result)! });
  }
  for (const { result } of prepared) {
    if (result.target.kind === 'enemy' && result.hpAfter === 0) {
      recordEvent(s, 'ENEMY_DIED', { target: result.target, batchId: result.batchId, damage: result, parentId: parentIds.get(result)! },
        { type: 'death', target: result.target.id });
      s.log.push(`敌人 #${result.target.id} 被击杀。`);
    }
  }
}

export function resolveDamageBatch(s: BattleState, requests: readonly DamageRequest[]): DamageResult[] {
  if (s.status !== 'playing') return [];
  const seen = new Set<string>();
  const prepared: PreparedDamage[] = [];
  // Plan everything before mutating anything, including formula validation.
  for (const request of requests) {
    const unit = request.target.kind === 'player' ? s.player : s.enemies.find(enemy => enemy.id === request.target.id);
    if (!unit || unit.hp <= 0) continue;
    const key = `${request.target.kind}:${request.target.id}`;
    if (seen.has(key)) throw new Error('同一同步伤害批次不能重复指定同一目标；多段伤害应建立独立批次。');
    seen.add(key);
    const modifiers = applicableModifiers(s, request);
    const resolved = calculateDamage(request.base, modifiers, request.baseTerms);
    const hpAfter = Math.max(0, unit.hp - resolved);
    const result: DamageResult = { batchId: s.nextDamageBatchId, kind: request.kind, target: { ...request.target },
      base: request.base, flat: modifiers.flat!, multipliers: modifiers.multipliers!, resolved,
      baseTerms: structuredClone(request.baseTerms ?? []),
      percentBonuses: modifiers.percentBonuses!,
      hpBefore: unit.hp, hpAfter, hpLost: unit.hp - hpAfter };
    prepared.push({ result, unit, distance: Math.abs(unit.position - s.player.position) });
  }
  if (!prepared.length) return [];
  prepared.sort((a, b) => a.distance - b.distance || a.result.target.id - b.result.target.id);
  s.nextDamageBatchId++;
  // Commit the entire batch. No damage helper, event dispatch, or terminal check
  // is called between targets, so observers cannot see a partial result.
  for (const { result, unit } of prepared) unit.hp = result.hpAfter;
  const deadIds = new Set(prepared.filter(item => item.result.target.kind === 'enemy' && item.result.hpAfter === 0).map(item => item.result.target.id));
  s.enemies = s.enemies.filter(enemy => !deadIds.has(enemy.id));
  recordBatchEvents(s, prepared);
  if (s.player.hp <= 0) finishBattle(s, 'lost', 'player-death');
  else if (!s.enemies.length) { s.lastKillPending = true; s.phase = 'closing'; }
  return prepared.map(item => item.result);
}
