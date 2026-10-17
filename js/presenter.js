// Turns game state and events into what the player sees: the HUD, the world marker, the
// minimap, the target arrow and the end-of-shift summary. It reads the game and tells the UI;
// it decides no rules.

import { Vector3 } from 'three';
import { HUD, MARKERS } from './config.js';
import { loadBest, saveBest } from './storage.js';

const naira = (value) => `₦${Math.round(value).toLocaleString('en-NG')}`;

/**
 * @param {{ game: ReturnType<typeof import('./game.js').createGame>, ui: ReturnType<typeof import('./ui.js').createUi>,
 *   markers: ReturnType<typeof import('./markers.js').createMarkers>,
 *   minimap: ReturnType<typeof import('./minimap.js').createMinimap>,
 *   terrain: object, camera: import('three').PerspectiveCamera, onGameOver: (summary: object) => void }} parts
 */
export function createPresenter({ game, ui, markers, minimap, terrain, camera, onGameOver }) {
  const aim = new Vector3();
  let sinceRefresh = Infinity;

  const targetOf = (order) => (order.stage === 'pickup' ? order.vendor : order.customer);
  const kindOf = (order) => (order.stage === 'pickup' ? 'pickup' : 'drop');

  function showOrder() {
    const { order } = game.state;
    ui.setOrder(order);
    if (!order) {
      markers.setTarget(null);
      return;
    }
    const spot = targetOf(order);
    markers.setTarget({ x: spot.x, z: spot.z, y: terrain.heightAt(spot.x, spot.z), kind: kindOf(order) });
  }

  function refreshHud() {
    const { state } = game;
    ui.setEarnings(state.earnings);
    ui.setRating(state.rating);
    ui.setClock(state.remaining);
    ui.setHealth(state.health);
    ui.setOrderDistance(state.guide ? state.guide.length : null);
    const { order } = state;
    if (order && order.stage === 'delivery') {
      ui.setOrderClock({ fraction: 1 - order.clock / order.budget, tip: game.liveTip().tip, late: order.late });
    }
  }

  /** @param {object[]} events from `game.step` or `game.start` */
  function handle(events) {
    for (const event of events) {
      switch (event.type) {
        case 'order':
          showOrder();
          ui.announce(`New order: ${event.order.type} from ${event.order.vendor.name}. Pays about ${naira(event.order.base)}.`);
          break;
        case 'pickup':
          showOrder();
          ui.toast('Picked up. Now deliver!', 'good');
          ui.announce(`Picked up from ${event.order.vendor.name}. Deliver to ${event.order.customer.hint}.`);
          break;
        case 'delivery': {
          const { pay } = event;
          ui.toast(pay.late ? `Late. +${naira(pay.total)}` : `+${naira(pay.total)}${pay.tip > 0 ? ` (tip ${naira(pay.tip)})` : ''}`, pay.late ? 'bad' : 'good');
          ui.announce(`Delivered. You earned ${naira(pay.total)}. Total ${naira(event.earnings)}.`);
          break;
        }
        case 'late':
          ui.toast('Late! The tip is gone', 'bad');
          ui.announce('This order is late. The tip is gone.');
          break;
        case 'crash':
          ui.hit();
          break;
        case 'nearmiss':
          if (event.paid) ui.toast(`Close one! +${naira(event.bonus)}`, 'good');
          break;
        case 'gameover': {
          const { state } = game;
          const previous = loadBest();
          const newBest = state.earnings > previous;
          if (newBest) saveBest(state.earnings);
          const summary = {
            earnings: state.earnings, deliveries: state.deliveries, rating: state.rating, reason: event.reason,
            best: Math.max(previous, state.earnings), newBest,
          };
          ui.showSummary(summary);
          markers.setTarget(null);
          ui.setArrow(null);
          onGameOver(summary);
          break;
        }
        default:
          break;
      }
    }
    refreshHud();
    sinceRefresh = 0;
  }

  /** Call once per drawn frame. */
  function update(dt, bike) {
    const { state } = game;
    sinceRefresh += dt;
    if (sinceRefresh >= HUD.refreshEvery) {
      refreshHud();
      sinceRefresh = 0;
    }
    if (state.phase !== 'playing' && state.phase !== 'paused') return;
    const { order } = state;
    if (!order) {
      ui.setArrow(null);
      minimap.draw({ bike, route: null, target: null });
      return;
    }
    const spot = targetOf(order);
    const color = order.stage === 'pickup' ? MARKERS.pickup : MARKERS.drop;
    minimap.draw({ bike, route: state.guide ? state.guide.points : null, target: { x: spot.x, z: spot.z, color } });

    aim.set(spot.x, terrain.heightAt(spot.x, spot.z) + 2, spot.z).project(camera);
    const behind = aim.z > 1;
    const visible = !behind && Math.abs(aim.x) < HUD.onScreenLimit && Math.abs(aim.y) < HUD.onScreenLimit;
    const nx = behind ? -aim.x : aim.x;
    const ny = behind ? -aim.y : aim.y;
    ui.setArrow({
      x: (nx * 0.5 + 0.5) * window.innerWidth, y: (-ny * 0.5 + 0.5) * window.innerHeight, visible, kind: kindOf(order),
    });
  }

  /** Reset the HUD for a new shift. */
  function reset() {
    ui.setBest(loadBest());
    sinceRefresh = Infinity;
  }

  return { handle, update, reset };
}
