import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";

const rawLevel = (process.env.EASYMEET_LOG_LEVEL || "info").toLowerCase();

const baseLogger = pino({
	level: rawLevel,
	base: null,
	messageKey: "msg",
	timestamp: pino.stdTimeFunctions.isoTime,
	formatters: {
		level(label: string) {
			return { level: label };
		},
	},
});

const logContextStore = new AsyncLocalStorage<Record<string, string>>();

const serverLogger = baseLogger.child({ channel: "server" });
const protooLogger = baseLogger.child({ channel: "protoo" });
const mediasoupLogger = baseLogger.child({ channel: "mediasoup" });
const httpLogger = baseLogger.child({ channel: "http" });

export function runWithLogContext(store: Record<string, string>, fn: () => void): void {
	const parent = logContextStore.getStore();
	return logContextStore.run({ ...parent, ...store }, fn);
}

export function runWithLogContextAsync<T>(store: Record<string, string>, fn: () => Promise<T>): Promise<T> {
	const parent = logContextStore.getStore();
	return logContextStore.run({ ...parent, ...store }, fn);
}

export function getLogContext(): Record<string, string> {
	return logContextStore.getStore() || {};
}

function contextFields(): Record<string, string> {
	const ctx = getLogContext();
	if (!ctx) return {};
	const out: Record<string, string> = {};
	if (ctx.requestId) out.requestId = ctx.requestId;
	if (ctx.connectionId) out.connectionId = ctx.connectionId;
	if (ctx.roomId) out.roomId = ctx.roomId;
	if (ctx.peerId) out.peerId = ctx.peerId;
	return out;
}

function normalizeArgs(
	args: unknown[]
): { msg: string | undefined; meta: Record<string, unknown> } {
	let msg: string | undefined;
	let error: Error | undefined;
	const meta: Record<string, unknown> = {};
	const extras: unknown[] = [];

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

function logWithLevel(targetLogger: Logger, level: "error" | "warn" | "info" | "debug", args: unknown[]): void {
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

export function logError(...args: unknown[]): void {
	logWithLevel(serverLogger, "error", args);
}

export function logWarn(...args: unknown[]): void {
	logWithLevel(serverLogger, "warn", args);
}

export function logInfo(...args: unknown[]): void {
	logWithLevel(serverLogger, "info", args);
}

export function logDebug(...args: unknown[]): void {
	logWithLevel(serverLogger, "debug", args);
}

export function logProtooInfo(...args: unknown[]): void {
	logWithLevel(protooLogger, "info", args);
}

export function logProtooWarn(...args: unknown[]): void {
	logWithLevel(protooLogger, "warn", args);
}

export function logProtooError(...args: unknown[]): void {
	logWithLevel(protooLogger, "error", args);
}

export function logProtooDebug(...args: unknown[]): void {
	logWithLevel(protooLogger, "debug", args);
}

export function logMediasoupInfo(...args: unknown[]): void {
	logWithLevel(mediasoupLogger, "info", args);
}

export function logMediasoupWarn(...args: unknown[]): void {
	logWithLevel(mediasoupLogger, "warn", args);
}

export function logMediasoupError(...args: unknown[]): void {
	logWithLevel(mediasoupLogger, "error", args);
}

export function logHttp(
	method: string,
	url: string,
	statusCode: number,
	durationMs: number,
	requestId?: string
): void {
	const fields: Record<string, unknown> = {
		...contextFields(),
		method,
		url,
		statusCode,
		durationMs,
	};

	if (requestId && requestId !== String(fields.requestId)) {
		fields.requestId = requestId;
	}

	httpLogger.info(fields, "http_request");
}
