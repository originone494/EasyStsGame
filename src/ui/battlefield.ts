import type { State } from '../game/state';
import { enemies } from '../content/enemies';
import { enemyOrder } from '../game/turn';
export function battlefield(s: State, selected?: number, targeting=false) {
 const order = enemyOrder(s);
 return `<div class="battlefield ${targeting?'choosing-target':''}" aria-label="${s.size}格战场">${Array.from({length:s.size},(_,position)=>{
 const e=s.enemies.find(e=>e.position===position); const player=s.player.position===position;
 return `<div class="cell ${player?'player-cell':''}"><span class="coordinate">${String(position).padStart(2,'0')}</span>${player?`<div class="player-unit"><img class="sprite hero-sprite" src="/art/player.png" alt="披风旅人"><div class="ground-ring friendly"></div></div>`:e?`<button class="enemy ${selected===e.id?'targeted':''}" data-target="${e.id}" aria-label="选择敌人 #${e.id} ${enemies[e.kind].name}"><span class="intent" title="下回合向队伍移动 ${e.speed} 格，接触造成 ${e.damage} 点伤害"><b>${position<s.player.position?'→':'←'} ${e.speed}</b><span>⚔ ${e.damage}</span></span><span class="unit-name"><i>${order.indexOf(e.id)+1}</i> ${enemies[e.kind].name}</span><img class="sprite enemy-sprite ${position<s.player.position?'facing-right':''}" src="/art/${e.kind}.png" alt=""><span class="ground-ring hostile"></span><span class="unit-health"><span style="width:${e.hp/e.maxHp*100}%"></span></span><span class="hp-label">${e.hp}<small>/${e.maxHp}</small> <span class="enemy-id">#${e.id}</span></span><span class="target-label">${selected===e.id?'已锁定':'选择目标'}</span></button>`:'<span class="empty">·</span>'}</div>`;
 }).join('')}</div>`;
}
