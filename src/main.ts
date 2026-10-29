import './style.css';
import { createBattle, type State } from './game/state';
import { act, type Action } from './game/actions';
import { createScenario, scenarios } from './game/scenarios';
import { encounters } from './content/encounters';
import { cards } from './content/cards';
import { battlefield } from './ui/battlefield';
import { hand } from './ui/hand';
import { panels, logPanel, result } from './ui/panels';
import { enemyOrder } from './game/turn';
let state = createBattle();
let selectedCard: number|undefined, selectedTarget: number|undefined;
let direction = 1;
let feedback: {position:number;text:string;tone:string}[]=[];
const app=document.querySelector<HTMLDivElement>('#app')!;
function reset(next=false) { state=state.scenario&&!next?createScenario(state.scenario,state.seed):createBattle((state.encounter+(next?1:0))%encounters.length,state.seed); selectedCard=selectedTarget=undefined; feedback=[]; render(); }
function perform(action:Action) {
 const previous:State=state;state=act(state,action);feedback=[];
 for(const e of state.events.slice(previous.events.length)){
  const position=e.target===undefined?previous.player.position:(previous.enemies.find(u=>u.id===e.target)?.position??state.enemies.find(u=>u.id===e.target)?.position??0);
  if(e.type==='damage')feedback.push({position,text:`−${e.amount}`,tone:'damage'});
  if(e.type==='heal')feedback.push({position:state.player.position,text:`+${e.amount}`,tone:'healing'});
  if(e.type==='collision')feedback.push({position,text:'碰撞',tone:'collision'});
 }
 for(const unit of state.enemies){const old=previous.enemies.find(u=>u.id===unit.id);if(old&&old.position!==unit.position)feedback.push({position:unit.position,text:`${unit.position>old.position?'→':'←'} ${Math.abs(unit.position-old.position)}格`,tone:'movement'});}
 if(state.player.position!==previous.player.position)feedback.push({position:state.player.position,text:`${state.player.position>previous.player.position?'→':'←'} 移步`,tone:'movement'});
 if(!state.notice)selectedCard=undefined;
 if(!state.enemies.some(e=>e.id===selectedTarget))selectedTarget=undefined;
 render();
}
function render() {
 const card=state.hand.find(c=>c.id===selectedCard); const def=card?cards[card.key]:undefined;
 const instruction=state.notice||(def?`「${def.name}」 ${def.target==='enemy'?(selectedTarget?'目标已锁定，确认出牌。':'点击战场上的敌人选择目标。'):def.target==='direction'?'选择移动方向，再确认出牌。':'准备就绪，确认后生效。'}`:'选择一张手牌，开始你的行动');
 app.innerHTML=`<div class="game-shell"><header class="game-header" ${state.status!=='playing'?'inert aria-hidden="true"':''}><div class="brand"><span class="brand-emblem">✧</span><div>隙间行者<small>THE WAYFARER</small></div></div><div class="stats">${panels(state)}</div><nav><button data-action="restart" title="重新开始当前战斗">重新开始</button><button data-action="next">切换测试战斗</button></nav></header><main ${state.status!=='playing'?'inert aria-hidden="true"':''}><section class="arena"><div class="scene-heading"><div class="chapter"><span class="chapter-line"></span>雾林古道 <small>THE MISTWOOD</small></div><h1>${state.scenario?'规则验证局面':encounters[state.encounter].name}</h1><p>${state.scenario?scenarios.find(s=>s.id===state.scenario)?.name:encounters[state.encounter].description}</p></div><div class="initiative"><small>下一次行动</small>${enemyOrder(state).map((id,i)=>`<span><b>${i+1}</b> #${id}</span>`).join('<i>›</i>')}<em>距离近的先行动</em></div><div class="scene-motes"><i></i><i></i><i></i><i></i><i></i></div><div class="battlefield-scroll">${battlefield(state,selectedTarget,def?.target==='enemy')}</div><div class="combat-feedback" aria-hidden="true">${feedback.map((f,i)=>`<span class="floating-number ${f.tone}" style="left:${(f.position+.5)/state.size*100}%;--delay:${i*.12}s">${f.text}</span>`).join('')}</div><div class="scene-footer"><span>✧ 敌人迈入队伍格时，造成接触伤害并消失</span><span>13 格战场 <b>·</b> 任意距离攻击</span></div></section><section class="play-area"><div class="hand-heading"><span>你的手牌 <b>${state.hand.length}</b></span><span>自由出牌 <i>◇</i> 回合开始补至 3 张</span></div><div class="hand-table"><div class="deck-pile draw-pile"><div class="deck-card">✧</div><b>${state.draw.length}</b><small>抽牌堆</small></div>${hand(state,selectedCard)}<div class="deck-pile discard-pile"><div class="deck-card">◇</div><b>${state.discard.length}</b><small>弃牌堆</small><span>消耗 ${state.exhaust.length} · 执行 ${state.executing.length}</span></div></div><div class="action-bar"><div role="status" class="instruction ${state.notice?'invalid':''}"><span class="instruction-icon">${state.notice?'!':'◇'}</span><span class="instruction-text">${instruction}</span></div><div class="action-buttons">${def?.target==='direction'?`<button data-direction="-1" aria-pressed="${direction===-1}">← 向左</button><button data-direction="1" aria-pressed="${direction===1}">向右 →</button>`:''}<button class="primary" data-action="play" ${!card||state.status!=='playing'?'disabled':''}>确认出牌</button><button class="end-turn" data-action="end" ${state.status!=='playing'?'disabled':''}>结束回合 →</button></div></div></section></main><footer class="utility-bar" ${state.status!=='playing'?'inert aria-hidden="true"':''}><span class="version">第一阶段 · 像素战斗原型</span>${logPanel(state)}<details class="help"><summary>玩法指南</summary><div class="utility-content"><h3>一条古道，每一步都重要</h3><p>选择手牌 → 点击敌人或选择方向 → 确认出牌。所有牌免费，没有每回合出牌次数限制。</p><p>攻击无距离限制。移动终点必须为空。击退碰撞传递剩余位移，不造成伤害。</p><p>结束回合会弃掉剩余手牌。怪物按距离从近到远逐只行动，同距按编号。</p><p>Enter 确认出牌 · Esc 取消选择。当前为单场战斗，无存档和地图。</p></div></details><details class="developer"><summary>开发用固定局面</summary><div class="utility-content"><label>随机种子 <input id="seed" type="number" min="0" max="4294967295" value="${state.seed}"></label><div class="debug">${scenarios.map(s=>`<button data-scenario="${s.id}">${s.name}</button>`).join('')}</div></div></details><span class="footer-flavor">林深处，旅途才刚刚开始。</span></footer>${result(state)}</div>`;
}
app.addEventListener('click',event=>{
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button'); if(!button||button.disabled)return;
 if(button.dataset.card!==undefined){selectedCard=Number(button.dataset.card);state={...state,notice:''};feedback=[];render();return;}
 if(button.dataset.target!==undefined){selectedTarget=Number(button.dataset.target);feedback=[];render();return;}
 if(button.dataset.direction){direction=Number(button.dataset.direction);feedback=[];render();return;}
 if(button.dataset.scenario){state=createScenario(button.dataset.scenario,state.seed);selectedCard=selectedTarget=undefined;feedback=[];render();return;}
 switch(button.dataset.action){
 case 'restart':reset();return;case 'next':reset(true);return;
 case 'play':if(selectedCard!==undefined)perform({type:'play',cardId:selectedCard,target:selectedTarget,direction});return;
 case 'end':perform({type:'endTurn'});return;
 }
});
app.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.id==='seed'){const n=Number(input.value);if(!Number.isInteger(n)||n<0||n>4294967295){state.notice='种子须为 0～4294967295 的整数。';render();return;}state=createBattle(state.encounter,n);selectedCard=selectedTarget=undefined;feedback=[];render();}});
document.addEventListener('keydown',e=>{if((e.target as HTMLElement).matches('input,button,summary'))return;if(e.key==='Escape'){selectedCard=selectedTarget=undefined;feedback=[];render();}if(e.key==='Enter'&&selectedCard!==undefined){e.preventDefault();perform({type:'play',cardId:selectedCard,target:selectedTarget,direction});}});
render();
