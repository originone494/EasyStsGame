import './style.css';
import { createBattle, type State } from './game/state';
import { act, type Action } from './game/actions';
import { createScenario, scenarios } from './game/scenarios';
import { encounters } from './content/encounters';
import { CardInteraction } from './ui/cardInteraction';
import { battlefield } from './ui/battlefield';
import { hand } from './ui/hand';
import { panels, result } from './ui/panels';
import { enemyOrder } from './game/turn';
// Fixed test entries remain available via URL, with no developer text in the game HUD.
const query = new URLSearchParams(location.search);
const seedValue = Number(query.get('seed') ?? 157);
const seed = Number.isInteger(seedValue) && seedValue >= 0 && seedValue <= 4294967295 ? seedValue : 157;
const encounterValue = Number(query.get('encounter') ?? 0);
const encounter = Number.isInteger(encounterValue) && encounterValue >= 0 && encounterValue < encounters.length ? encounterValue : 0;
const scenario = query.get('scenario');
let state = scenario && scenarios.some(s => s.id === scenario) ? createScenario(scenario, seed) : createBattle(encounter, seed);
let interaction: CardInteraction | undefined;
let feedback: {position:number;text:string;tone:string}[]=[];
const app=document.querySelector<HTMLDivElement>('#app')!;
function reset(next=false) { state=state.scenario&&!next?createScenario(state.scenario,state.seed):createBattle((state.encounter+(next?1:0))%encounters.length,state.seed); feedback=[]; render(); }
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
 render();
}
function render() {
 interaction?.cancel();
 app.innerHTML=`<div class="game-shell"><header class="game-header" ${state.status!=='playing'?'inert aria-hidden="true"':''}><div class="brand"><span class="brand-emblem">✧</span><div>简单尖塔</div></div><div class="stats">${panels(state)}</div><nav><button data-action="restart" title="重新开始当前战斗">重新开始</button><button data-action="next">切换测试战斗</button></nav></header><main ${state.status!=='playing'?'inert aria-hidden="true"':''}><section class="arena"><div class="initiative" aria-label="怪物行动顺序">${enemyOrder(state).map((id,i)=>`<span><b>${i+1}</b> #${id}</span>`).join('<i>›</i>')}</div><div class="scene-motes"><i></i><i></i><i></i><i></i><i></i></div><div class="battlefield-track">${battlefield(state)}</div><div class="combat-feedback" aria-hidden="true">${feedback.map((f,i)=>`<span class="floating-number ${f.tone}" style="left:${(f.position+.5)/state.size*100}%;--delay:${i*.12}s">${f.text}</span>`).join('')}</div><div class="hand-overlay" aria-label="悬浮手牌"><div class="deck-pile draw-pile" aria-label="抽牌堆 ${state.draw.length} 张"><div class="deck-card">✧</div><b>${state.draw.length}</b></div>${hand(state)}<div class="deck-pile discard-pile" aria-label="弃牌堆 ${state.discard.length} 张，消耗 ${state.exhaust.length} 张，执行 ${state.executing.length} 张"><div class="deck-card">◇</div><b>${state.discard.length}</b></div><div class="action-bar"><div class="action-buttons"><button class="end-turn" data-action="end" ${state.status!=='playing'?'disabled':''}>结束回合 →</button></div></div></div></section></main>${result(state)}</div>`;
}
interaction = new CardInteraction(app, {
 state: () => state,
 play: perform,
 notice: message => { state = { ...state, notice: message }; render(); },
});
app.addEventListener('click',event=>{
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button'); if(!button||button.disabled)return;
 switch(button.dataset.action){
 case 'restart':reset();return;case 'next':reset(true);return;
 case 'end':interaction?.cancel();perform({type:'endTurn'});return;
 }
});
render();
