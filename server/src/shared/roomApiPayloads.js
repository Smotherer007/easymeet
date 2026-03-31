/**
 * REST API payload parsing (create / host / join).
 * Mirror of client/src/shared/roomApiPayloads.js — update both when validation rules change.
 */

/**
 * @param {unknown} body
 * @returns {{ ok: true; data: { password: string; roomCode: string } } | { ok: false; code: string; message: string }}
 */
export function parseCreateRoomBody(body) {
	if (!body || typeof body !== "object") {
		return { ok: false, code: "VALIDATION", message: "Payload fehlt" };
	}
	const b = /** @type {Record<string, unknown>} */ (body);
	const password = (typeof b.password === "string" ? b.password : "").trim();
	const roomCode = (typeof b.roomCode === "string" ? b.roomCode : "").trim();
	return { ok: true, data: { password, roomCode } };
}

/**
 * @param {unknown} body
 * @returns {{ ok: true; data: { hostPeerId: string; hostSetupToken: string } } | { ok: false; code: string; message: string }}
 */
export function parseRegisterHostBody(body) {
	if (!body || typeof body !== "object") {
		return { ok: false, code: "VALIDATION", message: "Payload fehlt" };
	}
	const b = /** @type {Record<string, unknown>} */ (body);
	const hostPeerId = typeof b.hostPeerId === "string" ? b.hostPeerId.trim() : "";
	const hostSetupToken = typeof b.hostSetupToken === "string" ? b.hostSetupToken.trim() : "";
	if (!hostPeerId) {
		return { ok: false, code: "VALIDATION", message: "hostPeerId erforderlich" };
	}
	if (!hostSetupToken) {
		return { ok: false, code: "VALIDATION", message: "hostSetupToken erforderlich" };
	}
	return { ok: true, data: { hostPeerId, hostSetupToken } };
}

/**
 * @param {unknown} body
 * @param {string} [roomIdFromRoute]
 * @returns {{ ok: true; data: { identifier: string; password: string } } | { ok: false; code: string; message: string }}
 */
export function parseJoinBody(body, roomIdFromRoute = "") {
	if (!body || typeof body !== "object") {
		return { ok: false, code: "VALIDATION", message: "Payload fehlt" };
	}
	const b = /** @type {Record<string, unknown>} */ (body);
	const identifier = String(b.identifier ?? b.roomId ?? roomIdFromRoute ?? "").trim();
	const password = (typeof b.password === "string" ? b.password : "").trim();
	if (!identifier) {
		return { ok: false, code: "VALIDATION", message: "identifier erforderlich" };
	}
	return { ok: true, data: { identifier, password } };
}
