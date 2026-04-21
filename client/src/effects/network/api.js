/**
 * I/O: API calls using Result type (validation via client/src/shared/roomApiPayloads).
 */

import { ok, err } from "../../shared/result.js";
import { API_BASE } from "../../shared/constants.js";
import { parseCreateRoomBody, parseJoinBody } from "../../shared/roomApiPayloads.js";
import { fetchJson } from "./httpClient.js";
import { getClientId } from "../storage/clientIdentity.js";

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
 * @returns {Promise<import('../../shared/result.js').Result<{ roomId: string; hostPeerId: string | null }>>}
 */
export async function fetchCreateRoom(password, roomCode) {
	try {
		const clientId = getClientId();
		const res = await fetchJson(`${API_BASE}/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Easymeet-Client-Id": clientId },
			body: JSON.stringify({ password, roomCode })
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) {
			return err("API", apiFailureMessage(data, "Could not create room"));
		}
		return ok({
			roomId: String(data.roomId ?? ""),
			hostPeerId: data.hostPeerId == null ? null : String(data.hostPeerId)
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
		const clientId = getClientId();
		const res = await fetchJson(`${API_BASE}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Easymeet-Client-Id": clientId },
			body: JSON.stringify({ identifier: normalized || identifier, password })
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) {
			return err("API", apiFailureMessage(data, "Join failed"));
		}
		const roomId = String(data.roomId ?? identifier);
		const peerId = String(data.peerId ?? "");
		const wsToken = String(data.wsToken ?? "");
		const role = String(data.role ?? "user");
		if (!peerId || !wsToken) {
			return err("API", "Join response missing peerId or wsToken");
		}
		return ok({ roomId, peerId, wsToken, role });
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

export async function fetchServerAdminBootstrapLogin(token) {
	try {
		const res = await fetchJson(`${API_BASE}/admin/bootstrap-login`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Easymeet-Client-Id": getClientId()
			},
			body: JSON.stringify({ token: String(token || "").trim() })
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) return err("API", apiFailureMessage(data, "Server admin login failed"));
		return ok({ ok: true });
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

export async function fetchAdminMe() {
	try {
		const res = await fetchJson(`${API_BASE}/admin/me`, {
			headers: { "X-Easymeet-Client-Id": getClientId() }
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) return err("API", apiFailureMessage(data, "Could not load admin status"));
		return ok({
			isServerAdmin: Boolean(data.isServerAdmin)
		});
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

export async function fetchCreatePersistentRoom(payload) {
	try {
		const res = await fetchJson(`${API_BASE}/admin/persistent-rooms`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Easymeet-Client-Id": getClientId()
			},
			body: JSON.stringify({
				roomCode: String(payload?.roomCode || "").trim(),
				name: String(payload?.name || "").trim(),
				description: String(payload?.description || "").trim(),
				welcomeMessage: String(payload?.welcomeMessage || "").trim(),
				password: String(payload?.password || "")
			})
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) return err("API", apiFailureMessage(data, "Could not create persistent room"));
		return ok({
			room: /** @type {Record<string, unknown>} */ (data.room || {})
		});
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

export async function fetchDeletePersistentRoom(roomId) {
	try {
		const normalizedRoomId = String(roomId || "").trim().toUpperCase();
		const res = await fetchJson(`${API_BASE}/admin/persistent-rooms/${encodeURIComponent(normalizedRoomId)}`, {
			method: "DELETE",
			headers: {
				"X-Easymeet-Client-Id": getClientId()
			}
		});
		const data = /** @type {Record<string, unknown>} */ (res.data || {});
		if (!res.ok) return err("API", apiFailureMessage(data, "Could not delete persistent room"));
		return ok({ ok: true });
	} catch (e) {
		return err("NETWORK", "Connection failed", e);
	}
}

/**
 * @returns {Promise<import('../../shared/result.js').Result<{ rooms: Array<{ roomId: string; participantCount: number; hasPassword: boolean; participants?: string[] }> }>>}
 */
export async function fetchActiveRooms() {
	try {
		// Disable browser/proxy caching so an empty response cannot stick while the server already returns rooms
		const res = await fetchJson(`${API_BASE}/rooms/active?_=${Date.now()}`, {
			cache: "no-store",
			headers: { "Cache-Control": "no-cache" }
		});
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
		const res = await fetchJson(`${API_BASE}/rooms/pinned?_=${Date.now()}`, {
			cache: "no-store",
			headers: { "Cache-Control": "no-cache" }
		});
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
