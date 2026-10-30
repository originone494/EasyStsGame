import type { ListenerDefinition } from '../game/model';

// Development fixtures only. Not a formal relic pool or balance proposal.
export const testRelics = {
  lastHeal: { key: 'test_last_heal', name: '余烬（测试）', kind: 'relic', listensTo: ['ENEMY_DIED'],
    effects: [{ type: 'heal', amount: 3 }], limit: { scope: 'unlimited' }, allowChain: true },
  echo: { key: 'test_echo', name: '回响（测试）', kind: 'relic', listensTo: ['HEALED'],
    condition: { type: 'sourceKind', kind: 'relic' }, effects: [{ type: 'heal', amount: 1 }], limit: { scope: 'battle', count: 1 }, allowChain: false },
  firstHeal: { key: 'test_first_heal', name: '先行治疗（测试）', kind: 'relic', listensTo: ['DAMAGE_RESOLVED'],
    condition: { type: 'sourceKind', kind: 'card' }, effects: [{ type: 'heal', amount: 5 }], limit: { scope: 'battle', count: 1 }, allowChain: false },
  missingHp: { key: 'test_missing_hp', name: '锁定已损生命（测试）', kind: 'relic', listensTo: ['DAMAGE_RESOLVED'],
    condition: { type: 'sourceKind', kind: 'card' }, effects: [{ type: 'damage', target: 'nearest', amount: { missingHp: 1 } }], limit: { scope: 'battle', count: 1 }, allowChain: false },
  rescue: { key: 'test_rescue', name: '迟到治疗（测试）', kind: 'relic', listensTo: ['HP_LOST'],
    condition: { type: 'targetKind', kind: 'player' }, effects: [{ type: 'heal', amount: 20 }], limit: { scope: 'unlimited' }, allowChain: false },
} satisfies Record<string, ListenerDefinition>;
