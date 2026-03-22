/**
 * Einheitliches Server-Logging (HTTP-API, mediasoup, persistent rooms).
 * Steuerung: EASYMEET_LOG_LEVEL = silent | error | warn | info | debug (Standard: info).
 */

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

const raw = (process.env.EASYMEET_LOG_LEVEL || 'info').toLowerCase();
const current = LEVELS[raw] ?? LEVELS.info;

const PREFIX = '[easymeet/server]';

function should(level) {
  return current >= LEVELS[level];
}

/** @param {...unknown} args */
export function logError(...args) {
  if (should('error')) console.error(PREFIX, ...args);
}

/** @param {...unknown} args */
export function logWarn(...args) {
  if (should('warn')) console.warn(PREFIX, ...args);
}

/** @param {...unknown} args */
export function logInfo(...args) {
  if (should('info')) console.info(PREFIX, ...args);
}

/** @param {...unknown} args */
export function logDebug(...args) {
  if (should('debug')) console.info(PREFIX, '[debug]', ...args);
}

const PROTOO_PREFIX = '[easymeet/protoo]';

/** @param {...unknown} args */
export function logProtooInfo(...args) {
  if (should('info')) console.info(PROTOO_PREFIX, ...args);
}

/** @param {...unknown} args */
export function logProtooWarn(...args) {
  if (should('warn')) console.warn(PROTOO_PREFIX, ...args);
}

/** @param {...unknown} args */
export function logProtooError(...args) {
  if (should('error')) console.error(PROTOO_PREFIX, ...args);
}

/** @param {...unknown} args */
export function logProtooDebug(...args) {
  if (should('debug')) console.info(PROTOO_PREFIX, '[debug]', ...args);
}

const MS_PREFIX = '[easymeet/mediasoup]';

/** @param {...unknown} args */
export function logMediasoupInfo(...args) {
  if (should('info')) console.info(MS_PREFIX, ...args);
}

/** @param {...unknown} args */
export function logMediasoupWarn(...args) {
  if (should('warn')) console.warn(MS_PREFIX, ...args);
}

/** @param {...unknown} args */
export function logMediasoupError(...args) {
  if (should('error')) console.error(MS_PREFIX, ...args);
}

/**
 * HTTP-Zugriffslog: Methode, Pfad, Status, Dauer ms.
 */
export function logHttp(method, url, statusCode, durationMs) {
  if (!should('info')) return;
  console.info(PREFIX, method, url, statusCode, `${durationMs}ms`);
}
