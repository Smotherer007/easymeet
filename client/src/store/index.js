/**
 * Store – Dispatch, Subscriptions.
 * Single Source of Truth.
 */

import { createInitialState } from '../domain/reducers/initialState.js';
import { appReducer } from '../domain/reducers/appReducer.js';
import { logAppDebug } from '../utils/easymeetLog.js';

/** @type {AppState} */
let state = createInitialState();

/** @type {Set<(s: AppState) => void>} */
const subscribers = new Set();

/**
 * @param {AppEvent} event
 */
export function dispatch(event) {
  logAppDebug('dispatch', event?.type);
  state = appReducer(state, event);
  subscribers.forEach((fn) => fn(state, event));
}

/**
 * @param {(state: AppState) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * @returns {AppState}
 */
export function getState() {
  return state;
}

/**
 * Direktes State-Merge – nur noch für Legacy-Pfade (effects/ui/roomView, effects/media/*).
 * Neue Logik: `dispatch` + Events in `domain/events` und Handler in `appReducer`.
 * @param {Partial<AppState>} patch
 */
export function patchState(patch) {
  logAppDebug('patchState', Object.keys(patch || {}));
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn(state, { type: 'system/patchState', payload: patch }));
}
