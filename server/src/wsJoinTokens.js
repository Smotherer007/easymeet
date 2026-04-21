/**
 * One-time WebSocket handshake tokens after POST /api/join.
 * Prevents connecting to /ws with a guessed or sniffed peerId alone.
 */

import crypto from "crypto";

/** @type {Map<string, { roomId: string; peerId: string; clientId: string; expires: number }>} */
const pending = new Map();

const TTL_MS = 10 * 60 * 1000;

function sweep() {
	const now = Date.now();
	for (const [k, v] of pending.entries()) {
		if (v.expires < now) pending.delete(k);
	}
}

setInterval(() => sweep(), 60_000).unref?.();

/**
 * @param {string} roomIdNorm normalized room id (uppercase alnum)
 * @param {string} peerId server-assigned peer id
 * @param {string} clientId caller browser identity
 * @returns {string} hex token for WebSocket query `token`
 */
export function issueHandshakeToken(roomIdNorm, peerId, clientId = "") {
	sweep();
	const wsToken = crypto.randomBytes(32).toString("hex");
	pending.set(wsToken, { roomId: roomIdNorm, peerId, clientId, expires: Date.now() + TTL_MS });
	return wsToken;
}

/**
 * @param {string | null} token
 * @returns {{ roomId: string; peerId: string; clientId: string } | null}
 */
export function consumeHandshakeToken(token) {
	if (!token || typeof token !== "string" || token.length < 64) return null;
	sweep();
	const rec = pending.get(token);
	if (!rec || rec.expires < Date.now()) {
		if (rec) pending.delete(token);
		return null;
	}
	pending.delete(token);
	return { roomId: rec.roomId, peerId: rec.peerId, clientId: rec.clientId };
}

/**
 * @returns {string} opaque server-assigned peer id (hex)
 */
export function newAssignedPeerId() {
	return crypto.randomBytes(16).toString("hex");
}
