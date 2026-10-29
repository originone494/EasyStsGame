import type { State } from '../game/state';
import type { Action } from '../game/actions';
import { cards } from '../content/cards';
import { canMove } from '../game/movement';

interface Callbacks {
  state: () => State;
  play: (action: Action) => void;
  notice: (message: string) => void;
}
interface HeldCard {
  id: number;
  source: HTMLButtonElement;
  ghost: HTMLElement;
  aim: SVGSVGElement;
  pointerId?: number;
  startX: number;
  startY: number;
  moved: boolean;
  pickedThisPress: boolean;
}

// Pointer state is presentation only. Every successful drop goes through game/actions.
export class CardInteraction {
  private held?: HeldCard;
  private suppressContextMenu = false;
  constructor(private app: HTMLElement, private callbacks: Callbacks) {
    app.addEventListener('pointerdown', this.down);
    document.addEventListener('pointermove', this.move);
    document.addEventListener('pointerup', this.up);
    document.addEventListener('pointercancel', () => this.cancel());
    document.addEventListener('contextmenu', event => {
      if (this.held || this.suppressContextMenu) { event.preventDefault(); this.suppressContextMenu = false; this.cancel(); }
    });
    app.addEventListener('click', this.click, true);
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('resize', () => this.cancel());
    document.addEventListener('keydown', this.key);
  }

  cancel = () => {
    const held = this.held;
    if (!held) return;
    this.held = undefined;
    held.source.classList.remove('is-held');
    held.source.setAttribute('aria-pressed', 'false');
    held.ghost.remove(); held.aim.remove();
    this.app.classList.remove('holding-card');
    this.app.querySelector('.battlefield')?.classList.remove('choosing-target');
    this.app.querySelectorAll('.targeted').forEach(el => el.classList.remove('targeted'));
    this.app.querySelectorAll('.move-choice').forEach(el => el.remove());
    if (held.pointerId !== undefined && held.source.hasPointerCapture(held.pointerId)) {
      held.source.releasePointerCapture(held.pointerId);
    }
    this.setHint('左键拿牌，拖出手牌区使用 · 右键取消');
  };

  private setHint(text: string) {
    const hint = this.app.querySelector('.instruction-text');
    if (hint) hint.textContent = text;
  }

  private pick(source: HTMLButtonElement, x: number, y: number) {
    const state = this.callbacks.state();
    const card = state.hand.find(c => c.id === Number(source.dataset.card));
    if (!card || state.status !== 'playing') return;
    this.cancel();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-card'); ghost.removeAttribute('style');
    ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('tabindex', '-1');
    ghost.classList.add('held-card');
    const aim = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    aim.classList.add('target-aim'); aim.setAttribute('aria-hidden', 'true');
    aim.innerHTML = '<path class="aim-shadow"/><path class="aim-line"/><circle class="aim-end" r="7"/>';
    document.body.append(aim, ghost);
    source.classList.add('is-held'); source.setAttribute('aria-pressed', 'true');
    this.held = { id: card.id, source, ghost, aim, startX: x, startY: y, moved: false, pickedThisPress: true };
    this.app.classList.add('holding-card');
    this.app.querySelector('.instruction')?.classList.remove('invalid');
    const icon = this.app.querySelector('.instruction-icon');
    if (icon) icon.textContent = '◇';
    const def = cards[card.key];
    if (def.target === 'enemy') this.app.querySelector('.battlefield')?.classList.add('choosing-target');
    if (def.target === 'direction') {
      for (const direction of [-1, 1]) {
        const position = state.player.position + direction;
        const cell = this.app.querySelectorAll('.cell')[position];
        if (!cell) continue;
        const zone = document.createElement('button');
        const valid = canMove(state, direction);
        zone.className = 'move-choice' + (valid ? '' : ' blocked');
        zone.dataset.playDirection = String(direction);
        zone.setAttribute('aria-label', `${direction < 0 ? '向左' : '向右'}移动${valid ? '' : '（不可移动）'}`);
        zone.innerHTML = `<b>${direction < 0 ? '←' : '→'}</b><span>${valid ? '移动至此' : '位置被占据'}</span>`;
        cell.append(zone);
      }
    }
    this.update(x, y);
  }

  private down = (event: PointerEvent) => {
    if (event.button === 2 && this.held) { event.preventDefault(); this.suppressContextMenu = true; this.cancel(); return; }
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const source = target.closest<HTMLButtonElement>('.card[data-card]');
    if (source && !source.disabled) {
      event.preventDefault(); this.pick(source, event.clientX, event.clientY);
      if (this.held) {
        this.held.pointerId = event.pointerId;
        source.setPointerCapture(event.pointerId);
      }
    } else if (this.held) {
      if (target.closest('nav, .utility-bar, .end-turn, .result')) { this.cancel(); return; }
      event.preventDefault();
      this.held.pointerId = event.pointerId;
      this.held.startX = event.clientX; this.held.startY = event.clientY;
      this.held.pickedThisPress = false;
    }
  };

  private move = (event: PointerEvent) => {
    const held = this.held;
    if (!held) return;
    if (held.pointerId !== undefined && held.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - held.startX, event.clientY - held.startY) > 6) held.moved = true;
    this.update(event.clientX, event.clientY);
  };

  private inHand(x: number, y: number) {
    // The lower quarter is a logical drop boundary, never a separate layout panel.
    const rect = this.app.querySelector('.game-shell')!.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top + rect.height * 0.75 && y <= rect.bottom;
  }

  private actionAt(x: number, y: number): Action | undefined {
    const held = this.held;
    if (!held || this.inHand(x, y)) return;
    const element = document.elementFromPoint(x, y);
    if (!element?.closest('.arena')) return;
    const state = this.callbacks.state();
    const card = state.hand.find(c => c.id === held.id);
    if (!card) return;
    const def = cards[card.key];
    if (def.target === 'enemy') {
      const enemy = element.closest<HTMLElement>('[data-target]');
      const target = Number(enemy?.dataset.target);
      if (!enemy || !state.enemies.some(e => e.id === target)) return;
      return { type: 'play', cardId: card.id, target };
    }
    if (def.target === 'direction') {
      const choice = element.closest<HTMLElement>('[data-play-direction]');
      if (!choice) return;
      return { type: 'play', cardId: card.id, direction: Number(choice.dataset.playDirection) };
    }
    return { type: 'play', cardId: card.id };
  }

  private update(x: number, y: number) {
    const held = this.held;
    if (!held) return;
    held.ghost.style.left = `${x}px`; held.ghost.style.top = `${y}px`;
    const action = this.actionAt(x, y);
    const state = this.callbacks.state();
    const card = state.hand.find(c => c.id === held.id)!;
    const def = cards[card.key];
    const valid = !!action && (action.type !== 'play' || action.direction === undefined || canMove(state, action.direction));
    held.ghost.classList.toggle('can-play', valid);
    this.app.querySelectorAll('.targeted').forEach(el => el.classList.remove('targeted'));
    let targetX = x, targetY = y;
    if (action?.type === 'play' && action.target !== undefined) {
      const enemy = this.app.querySelector<HTMLElement>(`[data-target="${action.target}"]`)!;
      enemy.classList.add('targeted');
      const rect = enemy.getBoundingClientRect(); targetX = rect.left + rect.width / 2; targetY = rect.top + rect.height / 2;
    }
    const rect = held.source.getBoundingClientRect();
    const startX = rect.left + rect.width / 2, startY = rect.top + 20;
    held.aim.style.display = def.target === 'enemy' && !this.inHand(x, y) ? '' : 'none';
    held.aim.classList.toggle('valid-target', valid);
    const line = `M${startX},${startY} Q${startX},${Math.min(startY, targetY) - 100} ${targetX},${targetY}`;
    held.aim.querySelectorAll('path').forEach(el => el.setAttribute('d', line));
    const end = held.aim.querySelector('circle')!; end.setAttribute('cx', String(targetX)); end.setAttribute('cy', String(targetY));
    this.setHint(this.inHand(x, y) ? '拖出手牌区使用 · 右键取消' : valid ? '松开左键或再次点击，打出卡牌 · 右键取消' : def.target === 'enemy' ? '请对准一个敌人，无目标放置将返回手牌' : def.target === 'direction' ? '请对准队伍左右的移动标记' : '移到战场后松开或点击使用');
  }

  private drop(x: number, y: number) {
    const action = this.actionAt(x, y);
    const inHand = this.inHand(x, y);
    this.cancel();
    if (action) this.callbacks.play(action);
    else if (!inHand) this.callbacks.notice('未选择合法目标，卡牌已返回手牌。');
  }

  private up = (event: PointerEvent) => {
    const held = this.held;
    if (!held || event.button !== 0 || held.pointerId !== event.pointerId) return;
    if (held.source.hasPointerCapture(event.pointerId)) held.source.releasePointerCapture(event.pointerId);
    held.pointerId = undefined;
    if (held.pickedThisPress && !held.moved) { held.pickedThisPress = false; return; }
    this.drop(event.clientX, event.clientY);
  };

  // Pointer clicks are handled above; detail=0 preserves native keyboard activation.
  private click = (event: MouseEvent) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-card], [data-target], [data-play-direction]');
    if (!element) return;
    event.preventDefault(); event.stopPropagation();
    if (event.detail !== 0) return;
    const rect = element.getBoundingClientRect();
    if (element.dataset.card !== undefined) {
      const card = this.callbacks.state().hand.find(c => c.id === Number(element.dataset.card));
      if (card && this.held?.id === card.id && cards[card.key].target === 'none') {
        this.cancel(); this.callbacks.play({ type: 'play', cardId: card.id });
      } else this.pick(element as HTMLButtonElement, rect.left + rect.width / 2, rect.top + 20);
    }
    else if (this.held) this.drop(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  private key = (event: KeyboardEvent) => {
    if (!this.held) return;
    if (event.key === 'Escape') { event.preventDefault(); this.cancel(); }
    if (event.key === 'Enter' && !(event.target as HTMLElement).closest('button, input, summary')) {
      const state = this.callbacks.state();
      const card = state.hand.find(c => c.id === this.held!.id);
      if (card && cards[card.key].target === 'none') {
        event.preventDefault(); const id = card.id; this.cancel(); this.callbacks.play({ type: 'play', cardId: id });
      }
    }
  };
}
