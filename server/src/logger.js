/**
 * Einheitliches Server-Logging (HTTP-API, mediasoup, persistent rooms).
 * Steuerung: EASYMEET_LOG_LEVEL = silent | error | warn | info | debug (Standard: info).
 * Kontext: AsyncLocalStorage (requestId, connectionId, roomId, peerId) via runWithLogContext.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

const raw = (process.env.EASYMEET_LOG_LEVEL || "info").toLowerCase();
const current = LEVELS[raw] ?? LEVELS.info;

const PREFIX = "[easymeet/server]";
const PROTOO_PREFIX = "[easymeet/protoo]";
const MS_PREFIX = "[easymeet/mediasoup]";

/** @type {AsyncLocalStorage<Record<string, string>>} */
const logContextStore = new AsyncLocalStorage();

/**
 * @param {Record<string, string>} store
 * @param {() => void} fn
 */
export function runWithLogContext(store, fn) {
	const parent = logContextStore.getStore();
	return logContextStore.run({ ...parent, ...store }, fn);
}

/**
 * @template T
 * @param {Record<string, string>} store
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function runWithLogContextAsync(store, fn) {
	const parent = logContextStore.getStore();
	return logContextStore.run({ ...parent, ...store }, fn);
}

/**
 * @returns {Record<string, string>}
 */
export function getLogContext() {
	return logContextStore.getStore() || {};
}

function should(level) {
	return current >= LEVELS[level];
}

function shortId(s) {
	if (typeof s !== "string") return s;
	return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}

function metaSuffix() {
	const c = getLogContext();
	const parts = [];
	if (c.requestId) parts.push(`req=${shortId(c.requestId)}`);
	if (c.connectionId) parts.push(`conn=${shortId(c.connectionId)}`);
	if (c.roomId) parts.push(`room=${c.roomId}`);
	if (c.peerId) parts.push(`peer=${shortId(c.peerId)}`);
	if (!parts.length) return "";
	return ` [${parts.join(" ")}]`;
}

/** @param {...unknown} args */
export function logError(...args) {
	if (should("error")) console.error(PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logWarn(...args) {
	if (should("warn")) console.warn(PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logInfo(...args) {
	if (should("info")) console.info(PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logDebug(...args) {
	if (should("debug")) console.info(PREFIX + metaSuffix(), "[debug]", ...args);
}

/** @param {...unknown} args */
export function logProtooInfo(...args) {
	if (should("info")) console.info(PROTOO_PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logProtooWarn(...args) {
	if (should("warn")) console.warn(PROTOO_PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logProtooError(...args) {
	if (should("error")) console.error(PROTOO_PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logProtooDebug(...args) {
	if (should("debug")) console.info(PROTOO_PREFIX + metaSuffix(), "[debug]", ...args);
}

/** @param {...unknown} args */
export function logMediasoupInfo(...args) {
	if (should("info")) console.info(MS_PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logMediasoupWarn(...args) {
	if (should("warn")) console.warn(MS_PREFIX + metaSuffix(), ...args);
}

/** @param {...unknown} args */
export function logMediasoupError(...args) {
	if (should("error")) console.error(MS_PREFIX + metaSuffix(), ...args);
}

/**
 * HTTP-Zugriffslog: Methode, Pfad, Status, Dauer ms, optional Request-Id.
 * @param {string} [requestId]
 */
export function logHttp(method, url, statusCode, durationMs, requestId) {
	if (!should("info")) return;
	const id = requestId || getLogContext().requestId;
	const rid = id ? ` [req=${shortId(id)}]` : "";
	console.info(PREFIX + rid, method, url, statusCode, `${durationMs}ms`);
}
