/**
 * Client-Logging (API, mediasoup, App-Store).
 * Steuerung: VITE_LOG_LEVEL = silent | error | warn | info | debug (Standard: info).
 * In der Konsole filtern z. B.: easymeet/api | easymeet/ms | easymeet/app
 */

const LEVELS = /** @type {const} */ ({
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
});

const raw = String(import.meta.env.VITE_LOG_LEVEL || 'info').toLowerCase();
const current = LEVELS[/** @type {keyof typeof LEVELS} */ (raw)] ?? LEVELS.info;

function should(level) {
  return current >= LEVELS[level];
}

export const LOG_API = '[easymeet/api]';
export const LOG_MS = '[easymeet/ms]';
export const LOG_APP = '[easymeet/app]';

/** @param {...unknown} args */
export function logApiInfo(...args) {
  if (should('info')) console.info(LOG_API, ...args);
}

/** @param {...unknown} args */
export function logApiWarn(...args) {
  if (should('warn')) console.warn(LOG_API, ...args);
}

/** @param {...unknown} args */
export function logApiDebug(...args) {
  if (should('debug')) console.info(LOG_API, '[debug]', ...args);
}

/** @param {...unknown} args */
export function logMsInfo(...args) {
  if (should('info')) console.info(LOG_MS, ...args);
}

/** @param {...unknown} args */
export function logMsWarn(...args) {
  if (should('warn')) console.warn(LOG_MS, ...args);
}

/** @param {...unknown} args */
export function logMsError(...args) {
  if (should('error')) console.error(LOG_MS, ...args);
}

/** @param {...unknown} args */
export function logMsDebug(...args) {
  if (should('debug')) console.info(LOG_MS, '[debug]', ...args);
}

/** @param {...unknown} args */
export function logAppInfo(...args) {
  if (should('info')) console.info(LOG_APP, ...args);
}

/** @param {...unknown} args */
export function logAppDebug(...args) {
  if (should('debug')) console.info(LOG_APP, '[debug]', ...args);
}
