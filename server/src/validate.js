/**
 * Server-seitige Validierung – delegiert an ./shared/roomApiPayloads (Duplikat zum Client, manuell synchron halten).
 */

import { parseCreateRoomBody, parseRegisterHostBody, parseJoinBody } from "./shared/roomApiPayloads.js";

/**
 * @param {unknown} body
 * @returns {{ success: true; data: { password: string; roomCode: string } } | { success: false; error: { code: string; message: string } }}
 */
export function validateCreateRoomPayload(body) {
	const r = parseCreateRoomBody(body);
	if (!r.ok) return { success: false, error: { code: r.code, message: r.message } };
	return { success: true, data: r.data };
}

/**
 * @param {unknown} body
 * @returns {{ success: true; data: { hostPeerId: string } } | { success: false; error: { code: string; message: string } }}
 */
export function validateRegisterHostPayload(body) {
	const r = parseRegisterHostBody(body);
	if (!r.ok) return { success: false, error: { code: r.code, message: r.message } };
	return { success: true, data: r.data };
}

/**
 * @param {unknown} body
 * @param {string} [roomIdParam]
 * @returns {{ success: true; data: { identifier: string; password: string } } | { success: false; error: { code: string; message: string } }}
 */
export function validateJoinPayload(body, roomIdParam = "") {
	const r = parseJoinBody(body, roomIdParam);
	if (!r.ok) return { success: false, error: { code: r.code, message: r.message } };
	return { success: true, data: r.data };
}
