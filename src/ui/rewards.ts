import type { BattleState } from '../game/model';
import { summarizeScore } from '../game/scoring';
import { weatherLabels } from '../content/weather';
import { bossScore, bossSucceeded } from '../game/boss';

const percent = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);

export function scorePanel(s: BattleState): string {
  const score = s.boss ? bossScore(s.boss) : summarizeScore(s.scoring);
  return `<div class="score-status" role="status" aria-label="${s.boss?'Boss输出':'战斗评分'}"><span>${s.boss?'输出':'评分'} <b>${percent(score.percent)}%</b></span><small>${score.hpLost} / ${score.maxHp}</small>${s.boss?`<small class="boss-threshold">${bossSucceeded(s.boss)?'已达标':'未达标'} · 接触时结算</small>`:''}</div>`;
}

export function rewardPanel(s: BattleState): string {
  const score = s.reward?.score ?? (s.boss ? bossScore(s.boss) : summarizeScore(s.scoring));
  const reward = s.reward;
  const summary = `<div class="result-score">${s.boss?'输出评分':'评分'} <strong>${percent(score.percent)}%</strong><small>${s.boss?'累计伤害':'有效扣血'} ${score.hpLost} / ${score.maxHp}${s.boss?' 基准':''}</small></div>`;
  if (s.boss && s.status === 'won' && s.rewardConfig.floor === 3) return summary;
  if (s.boss && !reward?.eligible) return `${summary}<div class="reward-none">${s.finishReason==='player-death'?'队伍生命归零':'输出未达标'}，本次挑战结束</div>`;
  if (!reward?.eligible) return `${summary}<div class="reward-none">本场未获得奖励</div>`;
  const attributes = Object.values(weatherLabels).map(label => {
    const key = label.attribute;
    if (!reward.scaledAttributes[key]) return '';
    const overflow = reward.overflowAttributes[key];
    return `<div class="reward-attribute" data-reward-attribute="${key}">${label.icon} ${label.name}适应 <b>+${reward.gainedAttributes[key]}</b>${overflow ? `<small>已达上限${s.rewardConfig.attributeCap}，${overflow}点溢出</small>` : ''}</div>`;
  }).join('');
  return `${summary}<div class="reward-summary"><div class="reward-ratio">奖励比例 ${percent(reward.rewardRatio * 100)}%${s.boss&&reward.rewardRatio===5?' · 已达5倍上限':''}</div><div class="reward-gold">金币 <b>+${reward.gold}</b><small>余额 ${s.gold}</small></div>${attributes}</div>`;
}
