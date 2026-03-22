/**
 * I/O: API calls using Result type (Validierung über client/src/shared/roomApiPayloads).
 */

import { ok, err } from "../../shared/result.js";
import { API_BASE } from "../../shared/constants.js";
import { parseCreateRoomBody, parseJoinBody } from "../../shared/roomApiPayloads.js";
import { fetchJson } from "./httpClient.js";

/**
 * @param {unknown} data
 * @param {string} fallback
 */
function apiFailureMessage(data, fallback) {
	const o = data && typeof data === "object" ? /** @type {Record<string, unknown>} */ (data) : {};
	const msg = o.message ?? o.error;
	return typeof msg === "string" && msg.trim() ? msg : fallback;
}

/**
 * @param {unknown} payload
 * @returns {import('../../shared/result.js').Result<{ password: string; roomCode: string }>}
 */
export function validateCreateRoomPayload(payload) {
	const r = parseCreateRoomBody(payload);
	if (!r.ok) return err(r.code, r.message);
	return ok(r.data);
}

/**
 * @param {unknown} payload
 * @returns {import('../../shared/result.js').Result<{ identifier: string; password: string }>}
 */
export function validateJoinPayload(payload) {
	const r = parseJoinBody(payload, "");
	if (!r.ok) return err(r.code, r.message);
	return ok(r.data);
}

/**
 * @param {string} password
 * @param {string} roomCode
 * @returns {Promise<import('../../shared/result.js').Result<{ roomId: string }>>}
 */
export async function fetchCreateRoom(password, roomCode) {
	try {
		const res = await fetchJson(`${API_BASE}/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password, roomCode })
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) {
			return err("API", apiFailureMessage(data, "Could not create room"));
		}
		return ok({
			roomId: String(data.roomId ?? "")
		});
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

function normalizeRoomIdentifier(id) {
	return (
		(id || "")
			.trim()
			.replace(/[^A-Z0-9]/gi, "")
			.toUpperCase() || (id || "").trim()
	);
}

/**
 * @param {string} identifier
 * @param {string} password
 * @returns {Promise<import('../../shared/result.js').Result<{ roomId: string; peerId: string; wsToken: string }>>}
 */
export async function fetchJoinRoom(identifier, password) {
	try {
		const normalized = normalizeRoomIdentifier(identifier) || (identifier || "").trim();
		const res = await fetchJson(`${API_BASE}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ identifier: normalized || identifier, password })
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) {
			return err("API", apiFailureMessage(data, "Join failed"));
		}
		const roomId = String(data.roomId ?? identifier);
		const peerId = String(data.peerId ?? "");
		const wsToken = String(data.wsToken ?? "");
		if (!peerId || !wsToken) {
			return err("API", "Join response missing peerId or wsToken");
		}
		return ok({ roomId, peerId, wsToken });
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

/**
 * @returns {Promise<import('../../shared/result.js').Result<{ rooms: Array<{ roomId: string; participantCount: number; hasPassword: boolean; participants?: string[] }> }>>}
 */
export async function fetchActiveRooms() {
	try {
		const res = await fetchJson(`${API_BASE}/rooms/active`);
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) {
			return err("API", apiFailureMessage(data, "Could not load active rooms"));
		}
		const rooms = Array.isArray(data.rooms) ? data.rooms : [];
		return ok({ rooms });
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

/**
 * @returns {Promise<import('../../shared/result.js').Result<{ rooms: Array<{ roomId: string; hasPassword: boolean }> }>>}
 */
export async function fetchPinnedRooms() {
	try {
		const res = await fetchJson(`${API_BASE}/rooms/pinned`);
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) {
			return err("API", apiFailureMessage(data, "Could not load pinned rooms"));
		}
		const rooms = Array.isArray(data.rooms) ? data.rooms : [];
		return ok({ rooms });
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

export async function fetchRoomStatus(identifier) {
	try {
		const normalized = normalizeRoomIdentifier(identifier) || (identifier || "").trim();
		const id = normalized || (identifier || "").trim();
		const isCode = /^[A-Z0-9]{6,}$/i.test(id);
		const url = isCode ? `${API_BASE}/rooms/${id}` : `${API_BASE}/rooms?identifier=${encodeURIComponent(id)}`;
		const res = await fetchJson(url);
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) {
			return err("API", apiFailureMessage(data, "Status request failed"));
		}
		return ok({
			exists: !!data.exists,
			hasPassword: !!data.hasPassword
		});
	} catch (e) {
		return err("NETWORK", "Status request failed", e);
	}
}
