/**
 * Unified server logging (HTTP API, mediasoup, persistent rooms).
 * Controlled via EASYMEET_LOG_LEVEL = silent | error | warn | info | debug (default: info).
 * Uses AsyncLocalStorage context (requestId, connectionId, roomId, peerId) via runWithLogContext.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";

const rawLevel = (process.env.EASYMEET_LOG_LEVEL || "info").toLowerCase();

const baseLogger = pino({
	level: rawLevel,
	base: null,
	messageKey: "msg",
	timestamp: pino.stdTimeFunctions.isoTime,
	formatters: {
		level(label) {
			return { level: label };
		}
	}
});

/** @type {AsyncLocalStorage<Record<string, string>>} */
const logContextStore = new AsyncLocalStorage();

const serverLogger = baseLogger.child({ channel: "server" });
const protooLogger = baseLogger.child({ channel: "protoo" });
const mediasoupLogger = baseLogger.child({ channel: "mediasoup" });
const httpLogger = baseLogger.child({ channel: "http" });

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

function contextFields() {
	const ctx = getLogContext();
	if (!ctx) return {};
	const out = {};
	if (ctx.requestId) out.requestId = ctx.requestId;
	if (ctx.connectionId) out.connectionId = ctx.connectionId;
	if (ctx.roomId) out.roomId = ctx.roomId;
	if (ctx.peerId) out.peerId = ctx.peerId;
	return out;
}

/**
 * @param {unknown[]} args
 */
function normalizeArgs(args) {
	let msg;
	let error;
	const meta = {};
	const extras = [];

	for (const arg of args) {
		if (arg instanceof Error) {
			error = arg;
			continue;
		}
		if (typeof arg === "string" && msg === undefined) {
			msg = arg;
			continue;
		}
		if (arg && typeof arg === "object" && !Array.isArray(arg)) {
			Object.assign(meta, arg);
			continue;
		}
		if (arg !== undefined) {
			extras.push(arg);
		}
	}

	if (error) {
		meta.err = pino.stdSerializers.err(error);
	}
	if (extras.length > 0) {
		meta.extra = extras.length === 1 ? extras[0] : extras;
	}

	return { msg, meta };
}

function logWithLevel(targetLogger, level, args) {
	if (!targetLogger || typeof targetLogger[level] !== "function") return;
	if (!args.length) return;
	const { msg, meta } = normalizeArgs(args);
	const fields = { ...contextFields(), ...meta };
	const hasFields = Object.keys(fields).length > 0;

	if (hasFields && msg !== undefined) {
		targetLogger[level](fields, msg);
		return;
	}
	if (hasFields) {
		targetLogger[level](fields);
		return;
	}
	if (msg !== undefined) {
		targetLogger[level](msg);
	}
}

/** @param {...unknown} args */
export function logError(...args) {
	logWithLevel(serverLogger, "error", args);
}

/** @param {...unknown} args */
export function logWarn(...args) {
	logWithLevel(serverLogger, "warn", args);
}

/** @param {...unknown} args */
export function logInfo(...args) {
	logWithLevel(serverLogger, "info", args);
}

/** @param {...unknown} args */
export function logDebug(...args) {
	logWithLevel(serverLogger, "debug", args);
}

/** @param {...unknown} args */
export function logProtooInfo(...args) {
	logWithLevel(protooLogger, "info", args);
}

/** @param {...unknown} args */
export function logProtooWarn(...args) {
	logWithLevel(protooLogger, "warn", args);
}

/** @param {...unknown} args */
export function logProtooError(...args) {
	logWithLevel(protooLogger, "error", args);
}

/** @param {...unknown} args */
export function logProtooDebug(...args) {
	logWithLevel(protooLogger, "debug", args);
}

/** @param {...unknown} args */
export function logMediasoupInfo(...args) {
	logWithLevel(mediasoupLogger, "info", args);
}

/** @param {...unknown} args */
export function logMediasoupWarn(...args) {
	logWithLevel(mediasoupLogger, "warn", args);
}

/** @param {...unknown} args */
export function logMediasoupError(...args) {
	logWithLevel(mediasoupLogger, "error", args);
}

/**
 * HTTP access log: method, path, status, duration ms, optional requestId override.
 * @param {string} [requestId]
 */
export function logHttp(method, url, statusCode, durationMs, requestId) {
	const fields = {
		...contextFields(),
		method,
		url,
		statusCode,
		durationMs
	};

	if (requestId && requestId !== fields.requestId) {
		fields.requestId = requestId;
	}

	httpLogger.info(fields, "http_request");
}
