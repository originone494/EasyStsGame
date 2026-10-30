import './style.css';
import './ui/map.css';
import { createBattle, createBossBattle, type State } from './game/state';
import { act, type Action } from './game/actions';
import { createScenario, scenarios } from './game/scenarios';
import { encounters, prototype } from './content/encounters';
import { CardInteraction } from './ui/cardInteraction';
import { battlefield } from './ui/battlefield';
import { hand } from './ui/hand';
import { pileButton, pileBrowser, isPile, type Pile } from './ui/piles';
import { panels, result } from './ui/panels';
import { enemyOrder } from './game/turn';
import { eventInspector } from './ui/eventInspector';
import { weatherLabels } from './content/weather';
import { continueBattle } from './game/progression';
import type { RunState } from './game/model';
import { acknowledgeRunReward, actInRun, canEnterRunNode, createRun, currentNode, enterRunNode, leaveSafeNode } from './game/run';
import { runInspector, runMap, safeNodeScreen } from './ui/map';
import { createRunScenario } from './game/runScenarios';
// Fixed test entries remain available via URL, with no developer text in the game HUD.
const query = new URLSearchParams(location.search);
const seedValue = Number(query.get('seed') ?? prototype.seed);
const seed = Number.isInteger(seedValue) && seedValue >= 0 && seedValue <= 4294967295 ? seedValue : prototype.seed;
const encounterValue = Number(query.get('encounter') ?? 0);
const encounter = Number.isInteger(encounterValue) && encounterValue >= 0 && encounterValue < encounters.length ? encounterValue : 0;
const scenario = query.get('scenario');
const floorValue = Number(query.get('floor') ?? 1);
const floor = Number.isInteger(floorValue) && floorValue >= 1 && floorValue <= 3 ? floorValue : 1;
let state = scenario && scenarios.some(s => s.id === scenario) ? createScenario(scenario, seed)
 : query.get('battle')==='boss'?createBossBattle(floor,seed):createBattle(encounter, seed);
let openingState = structuredClone(state);
let run: RunState | null = query.get('mode')==='run'?(scenario==='runRoute'?createRunScenario(seed):createRun(seed)):null;
let showingMap=Boolean(run);
let interaction: CardInteraction | undefined;
let viewingPile: Pile | undefined;
let feedback: {position:number;text:string;tone:string}[]=[];
const app=document.querySelector<HTMLDivElement>('#app')!;
function reset(next=false) {
 state=next?createBattle((state.encounter+1)%encounters.length,state.seed):structuredClone(openingState);
 if(next)openingState=structuredClone(state);
 feedback=[];render();
}
function newRun() {
 for(const key of ['scenario','battle','floor','encounter'])query.delete(key);
 const search=query.toString();history.replaceState(null,'',`${location.pathname}${search?'?'+search:''}`);
 viewingPile=undefined;feedback=[];
 if(run){run=createRun(seed);showingMap=true;render();return;}
 state=createBattle(0,seed);openingState=structuredClone(state);render();
}
function startRun() {
 for(const key of ['scenario','battle','floor','encounter'])query.delete(key);
 query.set('mode','run');history.replaceState(null,'',`${location.pathname}?${query.toString()}`);
 run=createRun(seed);showingMap=true;viewingPile=undefined;feedback=[];render();
}
function perform(action:Action) {
 const previous:State=state;
 if(run){run=actInRun(run,action);state=run.battle!;}else state=act(state,action);
 feedback=[];
 for(const e of state.events.slice(previous.events.length)){
  const position=e.target===undefined?previous.player.position:(previous.enemies.find(u=>u.id===e.target)?.position??state.enemies.find(u=>u.id===e.target)?.position??0);
  if(e.type==='damage')feedback.push({position,text:`−${e.amount}`,tone:'damage'});
  if(e.type==='heal')feedback.push({position:state.player.position,text:`+${e.amount}`,tone:'healing'});
  if(e.type==='collision')feedback.push({position,text:'碰撞',tone:'collision'});
 }
 for(const event of state.eventHistory.slice(previous.eventHistory.length)){
  if(event.type==='WEATHER_CHANGED'&&event.weatherChange){const label=weatherLabels[event.weatherChange.to];feedback.push({position:state.player.position,text:`${label.icon} ${label.name}`,tone:'weather'});}
 }
 for(const unit of state.enemies){const old=previous.enemies.find(u=>u.id===unit.id);if(old&&old.position!==unit.position)feedback.push({position:unit.position,text:`${unit.position>old.position?'→':'←'} ${Math.abs(unit.position-old.position)}格`,tone:'movement'});}
 if(state.player.position!==previous.player.position)feedback.push({position:state.player.position,text:`${state.player.position>previous.player.position?'→':'←'} 移步`,tone:'movement'});
 render();
}
function render() {
 interaction?.cancel();
 if(run&&(showingMap||run.runStatus==='map'||run.runStatus==='safe')){
  const scroll=app.querySelector('.run-screen')?.scrollTop??0;
  const oldRoute=app.querySelector<HTMLElement>('.map-scroll');
  const routeScroll=oldRoute?.scrollTop, routeFloor=oldRoute?.dataset.mapFloorView;
  app.innerHTML=run.runStatus==='safe'&&!showingMap?safeNodeScreen(run):runMap(run);
  if(query.get('debug')==='events')app.insertAdjacentHTML('beforeend',runInspector(run));
  const screen=app.querySelector('.run-screen');if(screen)screen.scrollTop=scroll;
  const route=app.querySelector<HTMLElement>('.map-scroll');
  if(route&&routeFloor===route.dataset.mapFloorView&&routeScroll!==undefined)route.scrollTop=routeScroll;
  return;
 }
 if(run?.battle)state=run.battle;
 app.innerHTML=`<div class="game-shell"><header class="game-header" ${state.status!=='playing'||viewingPile?'inert aria-hidden="true"':''}><div class="brand"><span class="brand-emblem">✧</span><div>简单尖塔</div></div><div class="stats">${panels(state)}</div><nav>${run?'<button data-action="run-map">查看地图</button><button data-action="new-run">重新开局</button>':'<button data-action="start-run">开始冒险</button>'}${run?'':`<button data-action="restart" title="${state.boss?'重新开局':'重新开始当前战斗'}">${state.boss?'重新开局':'重新开始'}</button><button data-action="next">切换测试战斗</button>`}</nav></header><main ${state.status!=='playing'||viewingPile?'inert aria-hidden="true"':''}><section class="arena"><div class="initiative" aria-label="怪物行动顺序">${enemyOrder(state).map((id,i)=>`<span><b>${i+1}</b> #${id}</span>`).join('<i>›</i>')}</div><div class="scene-motes"><i></i><i></i><i></i><i></i><i></i></div><div class="battlefield-track">${battlefield(state)}</div><div class="combat-feedback" aria-hidden="true">${feedback.map((f,i)=>`<span class="floating-number ${f.tone}" style="left:${(f.position+.5)/state.size*100}%;--delay:${i*.12}s">${f.text}</span>`).join('')}</div><div class="hand-overlay" aria-label="悬浮手牌">${pileButton(state,'draw')}${hand(state)}${pileButton(state,'discard')}${pileButton(state,'exhaust')}<div class="action-bar"><div class="action-buttons"><button class="end-turn" data-action="end" ${state.status!=='playing'?'disabled':''}>结束回合 →</button></div></div></div></section></main>${result(state,run??undefined)}${viewingPile?pileBrowser(state,viewingPile):''}</div>`;
 if(query.get('debug') === 'events') {app.insertAdjacentHTML('beforeend', eventInspector(state));if(run)app.insertAdjacentHTML('beforeend',runInspector(run));}
 if(viewingPile){
  const dialog=app.querySelector<HTMLDialogElement>('.pile-dialog')!;
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>(`[data-view-pile="${viewingPile}"]`)?.focus();
 }
}
interaction = new CardInteraction(app, {
 state: () => state,
 play: perform,
 notice: message => { state = { ...state, notice: message }; if(run?.battle)run.battle=state;render(); },
});
function closePile() {
 const previous=viewingPile;viewingPile=undefined;render();
 if(previous)app.querySelector<HTMLButtonElement>(`[data-pile="${previous}"]`)?.focus();
}
app.addEventListener('cancel',event=>{if((event.target as HTMLElement).matches('.pile-dialog')){event.preventDefault();closePile();}},true);
app.addEventListener('click',event=>{
 if(event.target instanceof HTMLDialogElement){
  const r=event.target.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePile();
  return;
 }
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button'); if(!button||button.disabled)return;
 const pile=button.dataset.pile??button.dataset.viewPile;
 if(isPile(pile)&&state.status==='playing'){viewingPile=pile;render();return;}
 switch(button.dataset.action){
 case 'start-run':startRun();return;
 case 'exit-run':run=null;query.delete('mode');showingMap=false;newRun();return;
 case 'run-map':if(run){showingMap=true;viewingPile=undefined;render();}return;
 case 'run-return':if(run){showingMap=false;render();}return;
 case 'run-enter':if(run&&button.dataset.nodeId&&canEnterRunNode(run,button.dataset.nodeId)){run=enterRunNode(run,button.dataset.nodeId);showingMap=false;feedback=[];render();}return;
 case 'safe-leave':if(run?.runStatus==='safe'&&button.dataset.nodeId===currentNode(run).id){run=leaveSafeNode(run,button.dataset.nodeId);showingMap=true;render();}return;
 case 'run-ack':if(run?.runStatus==='reward'&&button.dataset.nodeId===currentNode(run).id){run=acknowledgeRunReward(run,button.dataset.nodeId);showingMap=true;feedback=[];render();}return;
 case 'close-pile':closePile();return;
 case 'restart':if(state.boss)newRun();else reset();return;case 'next':reset(true);return;
 case 'new-run':newRun();return;
 case 'continue':if(state.status==='won'&&state.reward?.eligible&&!state.scenario&&!state.boss){state=continueBattle(state);openingState=structuredClone(state);feedback=[];render();}return;
 case 'end':interaction?.cancel();perform({type:'endTurn'});return;
 }
});
render();
