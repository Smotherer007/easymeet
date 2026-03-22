/**
 * Composition Root – zentraler Einstieg für App-Start und Store.
 * Bootstrap-Orchestrierung: ./bootstrap/index.js
 */

export { bootstrap } from "./bootstrap/index.js";
export { getState, patchState, dispatch, subscribe } from "../store/index.js";
