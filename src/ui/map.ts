import type { MapNode, RunState } from '../game/model';
import { currentNode } from '../game/run';
import { isBattleNode } from '../game/map';
import { weatherLabels } from '../content/weather';
import { characters } from '../content/characters';
import { mapIcon, mapLandscape } from './mapArt';

export const nodeLabels = { battle: '普通战', elite: '精英战', boss: 'Boss', shop: '商店', campfire: '火堆', event: '？' };
const nodeIcons = { battle: '⚔', elite: '◆', boss: '♛', shop: '◇', campfire: '♨', event: '？' };

function rewardText(node: MapNode): string {
  if (!isBattleNode(node)) return node.beforeBoss ? 'Boss前休整' : node.kind === 'event' ? '进入后揭晓' : '安全节点';
  if (node.kind === 'boss' && node.floor === 3) return '最终挑战 · 成功即通关';
  const config = node.rewardConfig;
  const attributes = Object.values(weatherLabels).filter(label => config.baseAttributes[label.attribute] > 0)
    .map(label => `${label.name}适应 ${config.baseAttributes[label.attribute]}`).join(' · ');
  return `基准 ${config.baseGold}金币 · ${attributes}`;
}

function overview(run: RunState) {
  return `<div class="run-overview"><span>生命 <b>${run.currentHP} / ${run.maxHP}</b></span><span>金币 <b>${run.gold}</b></span><span>牌组 <b>${run.deck.length}</b></span><span>遗物 <b>${run.relics.length}</b></span><span>队伍 ${run.party.map(member => characters[member.key]?.name ?? member.key).join('、')}</span><div class="run-attributes">${Object.values(weatherLabels).map(label => `<span>${label.icon} ${label.name}适应 <b>${run.attributes[label.attribute]}</b></span>`).join('')}</div></div>`;
}

function header(run: RunState, title?: string) {
  const back = title === undefined && run.runStatus !== 'map'
    ? `<button data-action="run-return">${run.runStatus==='battle'?'返回战斗':run.runStatus==='safe'?'返回当前节点':'返回结算'}</button>` : '';
  return `<header class="run-header"><div><span class="run-kicker">简单尖塔</span>${title?`<h1>${title}</h1>`:''}</div><nav>${back}<button data-action="new-run">重新开局</button><button data-action="exit-run">返回试战</button></nav></header>${overview(run)}`;
}

export function runMap(run: RunState): string {
  const floor = run.currentFloor, current = currentNode(run), nodes = run.mapNodes.filter(node => node.floor === floor);
  const step = 108, height = (nodes.length - 1) * step + 240;
  const offsets = [45, 63, 37, 56, 29, 48, 67, 41, 60, 34];
  const points = nodes.map((node, index) => ({ x: node.kind === 'boss' ? 50 : offsets[(index + floor - 1) % offsets.length], y: height - 120 - index * step }));
  const paths = nodes.slice(0, -1).map((node, index) => {
    const a = points[index], b = points[index + 1];
    const complete = run.completedNodes.includes(node.id);
    return `<path class="map-link ${complete?'traveled':''}" d="M${a.x*6} ${a.y} C${a.x*6} ${a.y-52} ${b.x*6} ${b.y+52} ${b.x*6} ${b.y}"/>`;
  }).join('');
  return `<section class="run-screen map-screen" aria-label="线性地图">${header(run)}<div class="map-layout"><div class="map-scroll" data-map-floor-view="${floor}" tabindex="0" aria-label="可滚动路线图"><div class="map-parchment" style="height:${height}px">${mapLandscape()}<div class="map-destination">${floor===3?'最后的守望':'林冠之上'}<span>第${floor}层 · Boss挑战</span></div><svg class="map-connections" viewBox="0 0 600 ${height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg><ol class="map-route" aria-label="第${floor}层路线">${nodes.map((node, index) => {
    const complete = run.completedNodes.includes(node.id), active = node.id === current.id;
    const attribute = isBattleNode(node) && node.kind !== 'boss' ? Object.values(weatherLabels).filter(label => node.rewardConfig.baseAttributes[label.attribute] > 0)
      .map(label => `${label.name}+${node.rewardConfig.baseAttributes[label.attribute]}`).join(' ') : '';
    return `<li class="map-stop ${complete?'complete':active?'current':'future'} kind-${node.kind}" style="left:${points[index].x}%;top:${points[index].y}px"><button class="map-node ${active?'selected':''}" data-map-node="${node.id}" ${active?'aria-current="step"':''} ${active&&!complete&&run.runStatus==='map'?`data-action="run-enter" data-node-id="${node.id}"`:'aria-disabled="true"'} aria-label="${isBattleNode(node)?`第${node.battleIndex}战 `:''}${nodeLabels[node.kind]} ${complete?'已完成':active?'当前节点':'未到达'}" title="${nodeLabels[node.kind]} · ${rewardText(node)}">${mapIcon(node.kind)}${complete?'<span class="node-complete" aria-hidden="true">✓</span>':''}</button><span class="node-caption" aria-hidden="true">${nodeLabels[node.kind]}${attribute?`<small>${attribute}</small>`:''}</span>${active?'<span class="map-current-marker" aria-hidden="true">当前位置</span>':''}</li>`;
  }).join('')}</ol><div class="map-origin">${mapIcon('campfire')}<span>旅程由此开始</span></div></div></div></div></section>`;
}

export function safeNodeScreen(run: RunState): string {
  const node = currentNode(run);
  const copy = { shop: '商人暂未带来可以出售的货物。', campfire: '篝火安静地燃烧着。', event: '林间风声渐歇，旅途没有发生额外变化。' };
  const text = isBattleNode(node) ? '' : copy[node.kind];
  return `<section class="run-screen safe-screen" aria-label="安全节点">${header(run, node.kind==='event'?'林间空地':nodeLabels[node.kind])}<div class="safe-scene"><span class="safe-icon">${nodeIcons[node.kind]}</span><h2>${node.kind==='event'?'林间空地':nodeLabels[node.kind]}</h2><p>${text}</p><div><button data-action="run-map">查看地图</button><button class="primary" data-action="safe-leave" data-node-id="${node.id}">继续前进</button></div></div></section>`;
}

export function runInspector(run: RunState) {
  const escaped = JSON.stringify(run, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<details class="run-inspector"><summary>单局记录</summary><pre>${escaped}</pre></details>`;
}
