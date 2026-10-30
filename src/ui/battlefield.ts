import type { State } from '../game/state';
import { enemies } from '../content/enemies';
import { enemyOrder } from '../game/turn';
import type { EnemyState } from '../game/model';

function enemyButton(s: State, e: EnemyState, order: number[], selected?: number) {
 const definition=enemies[e.kind], boss=s.boss?.enemyId===e.id?s.boss:null;
 const intent=boss?`下回合向队伍移动 ${e.speed} 格，接触时立即结算挑战`:`下回合向队伍移动 ${e.speed} 格，接触造成 ${e.damage} 点伤害`;
 const value=boss?boss.accumulatedDamage:e.hp, maximum=boss?boss.baseMaxHp:e.maxHp;
 return `<button class="enemy ${boss?'boss ':''}${selected===e.id?'targeted':''}" data-target="${e.id}" aria-label="选择敌人 #${e.id} ${definition.name}"><span class="intent" title="${intent}"><b>${e.position<s.player.position?'→':'←'} ${e.speed}</b><span>${boss?'结算':`⚔ ${e.damage}`}</span></span><span class="unit-name"><i>${order.indexOf(e.id)+1}</i> ${boss?'Boss · ':''}${definition.name}</span><img class="sprite enemy-sprite ${e.position<s.player.position?'facing-right':''}" src="/art/${definition.art??e.kind}.png" alt=""><span class="ground-ring hostile"></span><span class="unit-health"><span style="width:${Math.min(100,value/maximum*100)}%"></span></span><span class="hp-label" ${boss?'title="累计伤害／生命基准"':''}>${value}<small>/${maximum}</small> <span class="enemy-id">#${e.id}</span></span><span class="target-label">${selected===e.id?'已锁定':'选择目标'}</span></button>`;
}
export function battlefield(s: State, selected?: number, targeting=false) {
 const order = enemyOrder(s);
 return `<div class="battlefield ${targeting?'choosing-target':''}" aria-label="${s.size}格战场">${Array.from({length:s.size},(_,position)=>{
 const e=s.enemies.find(e=>e.position===position); const player=s.player.position===position;
 return `<div class="cell ${player?'player-cell':''}"><span class="coordinate">${String(position).padStart(2,'0')}</span>${player?`<div class="player-unit"><img class="sprite hero-sprite" src="/art/player.png" alt="披风旅人"><div class="ground-ring friendly"></div></div>`:e?enemyButton(s,e,order,selected):'<span class="empty">·</span>'}</div>`;
 }).join('')}</div>`;
}
