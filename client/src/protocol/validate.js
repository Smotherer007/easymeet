/**
 * Validation of peer messages.
 * Pure functions – no side effects.
 */

import { ok, err } from "../shared/result.js";

/**
 * Checks whether data is a valid object with a type field.
 * @param {unknown} data
 * @returns {data is object & { type: string }}
 */
function isTypedObject(data) {
	return data !== null && typeof data === "object" && !Array.isArray(data) && !(data instanceof ArrayBuffer);
}

/**
 * Validiert join-Nachricht.
 * @param {unknown} data
 * @returns {import('../shared/result.js').Result<{ type: 'join'; nick: string }>}
 */
export function validateJoinMessage(data) {
	if (!isTypedObject(data) || data.type !== "join") {
		return err("VALIDATION", "Not a join message");
	}
	const nick = String(data.nick ?? "").trim();
	if (!nick) return err("VALIDATION", "nick required");
	return ok({ type: "join", nick });
}

/**
 * Validates chat message.
 * @param {unknown} data
 * @returns {import('../shared/result.js').Result<{ type: 'chat'; nick: string; text: string; ts: number; giphyUrls: string[] }>}
 */
export function validateChatMessage(data) {
	if (!isTypedObject(data) || data.type !== "chat") {
		return err("VALIDATION", "Not a chat message");
	}
	const nick = String(data.nick ?? "").trim();
	const text = String(data.text ?? "");
	const ts = Number(data.ts) || Date.now();
	const urls = Array.isArray(data.giphyUrls) ? data.giphyUrls : data.giphyUrl ? [data.giphyUrl] : [];
	return ok({ type: "chat", nick, text, ts, giphyUrls: urls });
}

/**
 * Validates mute message.
 * @param {unknown} data
 * @returns {import('../shared/result.js').Result<{ type: 'mute'; peerId: string; muted: boolean }>}
 */
export function validateMuteMessage(data) {
	if (!isTypedObject(data) || data.type !== "mute") {
		return err("VALIDATION", "Not a mute message");
	}
	const peerId = String(data.peerId ?? "");
	const muted = Boolean(data.muted);
	return ok({ type: "mute", peerId, muted });
}

/* Defensive caps against malicious/broken servers or MITM. All numbers chosen
 * liberally — legitimate payloads fit comfortably. */
const MAX_STR_LEN = 8192; /* chat bodies etc. */
const MAX_SHORT_STR_LEN = 256; /* nicks, filenames, ids */
const MAX_ARRAY_LEN = 500;

function str(v, max = MAX_STR_LEN) {
	if (v === null || v === undefined) return "";
	const s = String(v);
	return s.length > max ? s.slice(0, max) : s;
}
function shortStr(v) {
	return str(v, MAX_SHORT_STR_LEN);
}
function boolish(v) {
	return Boolean(v);
}
function num(v, fallback = 0) {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Sanitizes an incoming Protoo `easymeet` payload from the server before it is
 * dispatched into the store. Returns `null` when the payload is not a valid
 * typed object — caller should drop it silently.
 *
 * This is not a full schema check (no zod dep); it normalizes types, enforces
 * length caps on strings/arrays, and rejects structurally malformed payloads.
 *
 * @param {unknown} data
 * @returns {Record<string, unknown> | null}
 */
export function sanitizeEasymeetPayload(data) {
	if (!isTypedObject(data)) return null;
	const d = /** @type {Record<string, unknown>} */ (data);
	const type = typeof d.type === "string" ? d.type : "";
	if (!type || type.length > 64) return null;
	switch (type) {
		case "chat":
			return {
				type,
				nick: shortStr(d.nick),
				text: str(d.text),
				ts: num(d.ts, Date.now()),
				giphyUrls: Array.isArray(d.giphyUrls) ? d.giphyUrls.slice(0, 4).map(shortStr) : d.giphyUrl ? [shortStr(d.giphyUrl)] : []
			};
		case "file_share":
			return {
				type,
				nick: shortStr(d.nick),
				filename: shortStr(d.filename),
				ts: num(d.ts, Date.now()),
				fileId: d.fileId ? shortStr(d.fileId) : undefined
			};
		case "file_start":
			return {
				type,
				fileId: shortStr(d.fileId),
				filename: shortStr(d.filename),
				mimeType: shortStr(d.mimeType),
				size: num(d.size, 0),
				encrypted: boolish(d.encrypted),
				fromNick: shortStr(d.fromNick)
			};
		case "file_end":
			return { type, filename: shortStr(d.filename) };
		case "file_chunk":
			/* chunk is passed through; base64 decoded downstream. */
			return { type, chunk: typeof d.chunk === "string" ? d.chunk : "" };
		case "new_peer":
		case "peer_left":
			return {
				type,
				peerId: shortStr(d.peerId),
				nick: shortStr(d.nick),
				videoEnabled: d.videoEnabled === undefined ? undefined : boolish(d.videoEnabled),
				backgroundEffect: d.backgroundEffect === undefined ? undefined : shortStr(d.backgroundEffect),
				muted: d.muted === undefined ? undefined : boolish(d.muted),
				handRaised: d.handRaised === undefined ? undefined : boolish(d.handRaised)
			};
		case "members_updated": {
			const raw = Array.isArray(d.members) ? d.members.slice(0, MAX_ARRAY_LEN) : [];
			return {
				type,
				members: raw
					.filter((m) => m && typeof m === "object")
					.map((m) => ({
						peerId: shortStr(/** @type {any} */ (m).peerId),
						nick: shortStr(/** @type {any} */ (m).nick),
						handRaised: boolish(/** @type {any} */ (m).handRaised)
					}))
			};
		}
		case "mute":
			return { type, peerId: shortStr(d.peerId), muted: boolish(d.muted) };
		case "video":
			return { type, peerId: shortStr(d.peerId), videoEnabled: boolish(d.videoEnabled) };
		case "background_effect":
			return { type, peerId: shortStr(d.peerId), effect: shortStr(d.effect) };
		case "screen_sharing_stopped":
			return { type, peerId: shortStr(d.peerId) };
		case "reaction":
			return { type, peerId: shortStr(d.peerId), emoji: shortStr(d.emoji) };
		case "reaction_effect":
			return { type, peerId: shortStr(d.peerId), effect: shortStr(d.effect) };
		case "hand_raise":
			return { type, peerId: shortStr(d.peerId), raised: boolish(d.raised) };
		case "poll_created":
		case "poll_update":
			/* The poll object itself is complex; pass-through but gate on it being an object. */
			return { type, poll: isTypedObject(d.poll) ? d.poll : null };
		default:
			/* Unknown type — let it through so new server-side additions aren't
			 * blocked by an older client. Caller switches in handleEasymeetPayload
			 * ignore unknowns anyway. */
			return { ...d, type };
	}
}

/**
 * Parses peer event to validated message.
 * Returns null when not an app message (e.g. binary). * @param {unknown} data
 * @returns {import('../shared/result.js').Result<import('./messages.js').PeerMessage> | null}
 */
export function parsePeerEvent(data) {
	if (!isTypedObject(data)) return null;
	const d = /** @type {Record<string, unknown>} */ (data);
	switch (d.type) {
		case "join":
			return validateJoinMessage(d);
		case "leave":
			return ok({ type: "leave", nick: String(d.nick ?? "?"), peerId: d.peerId ? String(d.peerId) : undefined });
		case "chat": {
			const r = validateChatMessage(d);
			return r.success ? ok({ ...r.data, type: "chat" }) : r;
		}
		case "file_share":
			return ok({
				type: "file_share",
				nick: String(d.nick ?? "?"),
				filename: String(d.filename ?? ""),
				ts: Number(d.ts) || Date.now(),
				fileId: d.fileId ? String(d.fileId) : undefined
			});
		case "members":
			return ok({ type: "members", list: Array.isArray(d.list) ? d.list.map(String) : [] });
		case "peers":
			return ok({
				type: "peers",
				list: Array.isArray(d.list) ? d.list.map(String) : [],
				members: Array.isArray(d.members) ? d.members.map((m) => ({ peerId: String(m?.peerId ?? ""), nick: String(m?.nick ?? "?") })) : undefined
			});
		case "new_peer":
			return ok({ type: "new_peer", peerId: String(d.peerId ?? ""), nick: String(d.nick ?? "?") });
		case "mute":
			return validateMuteMessage(d);
		case "screen_sharing":
			return ok({ type: "screen_sharing", peerId: String(d.peerId ?? ""), nick: String(d.nick ?? "?") });
		case "screen_sharing_stopped":
			return ok({ type: "screen_sharing_stopped", peerId: String(d.peerId ?? "") });
		case "screen_stream":
			return ok({ type: "screen_stream", peerId: String(d.peerId ?? ""), nick: d.nick ? String(d.nick) : undefined });
		case "host_leaving":
			return ok({ type: "host_leaving" });
		default:
			return null;
	}
}
