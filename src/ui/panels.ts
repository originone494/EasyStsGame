import type { State } from '../game/state';
import { weatherPanel } from './weather';
import { rewardPanel, scorePanel } from './rewards';
export function panels(s:State) {
 return `<div class="hero-status"><div class="health-track" role="progressbar" aria-label="生命" aria-valuenow="${s.player.hp}" aria-valuemax="${s.player.maxHp}" aria-valuemin="0"><span style="width:${s.player.hp/s.player.maxHp*100}%"></span><b>♥ ${s.player.hp} / ${s.player.maxHp}</b></div></div><div class="turn-status"><strong>${String(s.turn).padStart(2,'0')}</strong><small>回合</small></div><div class="gold-status" aria-label="金币余额">金币 <b>${s.gold}</b></div>${scorePanel(s)}${weatherPanel(s)}`;
}
export function result(s:State) {
 if(s.status==='playing')return '';
 const title=s.boss?(s.status==='won'?(s.rewardConfig.floor===3?'通关成功':'挑战成功'):'挑战失败'):(s.status==='won'?'战斗胜利':'战斗失败');
 const actions=s.boss?'<button data-action="new-run">重新开局</button>':`${s.status==='won'&&s.reward?.eligible&&!s.scenario?'<button class="primary" data-action="continue">继续战斗</button>':''}<button data-action="restart">再战一次</button><button data-action="next">切换测试战斗</button>`;
 return `<div class="result-scrim"><section class="result ${s.status}" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-emblem">${s.status==='won'?'✦':'♢'}</div><h2 id="result-title">${title}</h2><div class="result-rule"></div><p class="result-stats">${s.turn} 回合 · 剩余生命 ${s.player.hp}/${s.player.maxHp}</p>${rewardPanel(s)}<div class="result-actions">${actions}</div></section></div>`;
}
