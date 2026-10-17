// Orders, pay and rating. Pure: no three.js, no DOM.
// An order runs in two legs. The pickup leg has no clock. The delivery clock starts at pickup
// and its budget comes from the A* route length between vendor and customer.

import { ECONOMY, FRAGILE, ORDERS, RATING } from './config.js';
import { routeBetween } from './route.js';

const roundTo = (value, step) => Math.round(value / step) * step;

/**
 * @param {number} routeMetres vendor to customer along the roads
 * @returns {number} base fare in whole naira, rounded to the nearest 50
 */
export function fareFor(routeMetres) {
  return roundTo(ECONOMY.fareFlat + ECONOMY.farePerMetre * routeMetres, ECONOMY.fareRoundTo);
}

/**
 * @param {number} routeMetres
 * @returns {number} seconds allowed from pickup to drop-off
 */
export function timeBudgetFor(routeMetres) {
  return (routeMetres / ECONOMY.budgetSpeed) * ECONOMY.budgetSlack + ECONOMY.budgetPadSeconds;
}

/**
 * The tip starts at a share of the fare and falls in a straight line to zero at the budget.
 * @param {{ base: number, elapsed: number, budget: number }} clock
 * @returns {number} whole naira
 */
export function tipAt({ base, elapsed, budget }) {
  const left = Math.max(0, 1 - elapsed / budget);
  return Math.round(base * ECONOMY.tipShare * left);
}

/**
 * What a delivery pays when it completes.
 * @param {{ base: number, elapsed: number, budget: number }} clock
 * @returns {{ late: boolean, base: number, tip: number, total: number }} whole naira
 */
export function settleDelivery({ base, elapsed, budget }) {
  if (elapsed > budget) {
    const reduced = Math.round(base * ECONOMY.lateFareFactor);
    return { late: true, base: reduced, tip: 0, total: reduced };
  }
  const tip = tipAt({ base, elapsed, budget });
  return { late: false, base, tip, total: base + tip };
}

/**
 * @param {number} condition 0 to 100
 * @returns {boolean} a fragile order below the limit is spoiled: no tip, no streak
 */
export function isSpoiled(condition) {
  return condition < FRAGILE.spoiledBelow;
}

/**
 * @param {number} condition 0 to 100
 * @param {number} loss points to take off
 * @returns {number} the new condition, never below 0
 */
export function loseCondition(condition, loss) {
  return Math.max(0, condition - Math.max(0, loss));
}

/**
 * @param {number} damage bike health a crash cost
 * @returns {number} condition points the parcel loses
 */
export function crashConditionLoss(damage) {
  return damage * FRAGILE.perDamage;
}

/**
 * What a finished order pays, with the fragile condition applied. A fragile order pays its
 * share of the normal pay (condition / 100); once spoiled the tip is gone as well.
 * @param {{ base: number, elapsed: number, budget: number, fragile?: boolean, condition?: number }} order
 * @returns {{ late: boolean, base: number, tip: number, fragile: boolean, condition: number,
 *   spoiled: boolean, total: number }} whole naira
 */
export function settleOrder({ base, elapsed, budget, fragile = false, condition = FRAGILE.start }) {
  const pay = settleDelivery({ base, elapsed, budget });
  if (!fragile) return { ...pay, fragile: false, condition: FRAGILE.start, spoiled: false };
  const spoiled = isSpoiled(condition);
  const tip = spoiled ? 0 : pay.tip;
  const total = Math.round(((pay.base + tip) * condition) / 100);
  return { late: pay.late, base: pay.base, tip, fragile: true, condition, spoiled, total };
}

/**
 * Near-miss bonus, at most ECONOMY.nearMissMax per order.
 * @param {number} countSoFar near misses already paid on this order
 * @returns {{ paid: boolean, bonus: number }}
 */
export function nearMissPayout(countSoFar) {
  return countSoFar < ECONOMY.nearMissMax ? { paid: true, bonus: ECONOMY.nearMissBonus } : { paid: false, bonus: 0 };
}

/**
 * @param {number} rating current rating
 * @param {{ late: boolean, clean: boolean }} delivery `clean` means no crash during the order
 * @returns {number} new rating, kept between RATING.min and RATING.max
 */
export function rateDelivery(rating, { late, clean }) {
  let change = RATING.late;
  if (!late) change = clean ? RATING.cleanOnTime : RATING.dirtyOnTime;
  return Math.max(RATING.min, Math.min(RATING.max, rating + change));
}

/**
 * @param {number} rating
 * @returns {number} rating after a crash
 */
export function rateCrash(rating) {
  return Math.max(RATING.min, Math.min(RATING.max, rating + RATING.crash));
}

/**
 * @param {number} rating
 * @returns {number} rating after hitting a pedestrian
 */
export function ratePedestrian(rating) {
  return Math.max(RATING.min, Math.min(RATING.max, rating + RATING.pedestrian));
}

/**
 * Build the next order, or null if the map offers nothing reachable.
 * @param {{ rng: ReturnType<typeof import('./rng.js').createRng>, graph: object,
 *   vendors: object[], customers: object[], from: { x: number, z: number },
 *   lastVendorId?: string|null, lastCustomerId?: string|null }} input
 * @returns {object|null}
 */
export function generateOrder({ rng, graph, vendors, customers, from, lastVendorId = null, lastCustomerId = null }) {
  const pickLeg = vendors
    .filter((v) => v.id !== lastVendorId)
    .map((vendor) => ({ vendor, leg: routeBetween(graph, from, vendor) }))
    .filter((c) => c.leg);
  if (pickLeg.length === 0) return null;
  const near = pickLeg.filter((c) => c.leg.length >= ORDERS.pickupMin && c.leg.length <= ORDERS.pickupMax);
  const chosen = near.length > 0
    ? rng.pick(near)
    : pickLeg.reduce((a, b) => (Math.abs(b.leg.length - ORDERS.pickupMin) < Math.abs(a.leg.length - ORDERS.pickupMin) ? b : a));

  const dropLeg = customers
    .filter((c) => c.id !== lastCustomerId)
    .map((customer) => ({ customer, route: routeBetween(graph, chosen.vendor, customer) }))
    .filter((c) => c.route);
  if (dropLeg.length === 0) return null;
  const inRange = dropLeg.filter((c) => c.route.length >= ORDERS.deliveryMin && c.route.length <= ORDERS.deliveryMax);
  const middle = (ORDERS.deliveryMin + ORDERS.deliveryMax) / 2;
  const drop = inRange.length > 0
    ? rng.pick(inRange)
    : dropLeg.reduce((a, b) => (Math.abs(b.route.length - middle) < Math.abs(a.route.length - middle) ? b : a));

  const meters = drop.route.length;
  return {
    type: chosen.vendor.type,
    vendor: chosen.vendor,
    customer: drop.customer,
    route: drop.route,
    pickupMeters: chosen.leg.length,
    meters,
    base: fareFor(meters),
    budget: timeBudgetFor(meters),
    nearMisses: 0,
    clean: true,
    fragile: rng.chance(FRAGILE.chance),
    condition: FRAGILE.start,
  };
}
