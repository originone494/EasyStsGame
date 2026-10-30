import type { BattleState } from '../game/model';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
// Opt-in development view only, enabled through ?debug=events.
export function eventInspector(s: BattleState): string {
  const details = JSON.stringify({ phase: s.phase, status: s.status, finishReason: s.finishReason,
    queue: s.eventQueue.map(event => event.id), listeners: s.listeners, damageModifiers: s.damageModifiers, pushes: s.pushHistory,
    weather: s.weather, attributes: s.attributes,
    scoring: s.scoring, gold: s.gold, rewardConfig: s.rewardConfig, reward: s.reward,
    events: s.eventHistory, trace: s.eventTrace }, null, 2);
  return `<details class="event-inspector"><summary>事件日志 · ${s.eventHistory.length}</summary><pre>${escape(details)}</pre></details>`;
}
