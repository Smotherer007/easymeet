/**
 * REST API payload parsing (create / host / join).
 * Mirror of client/src/shared/roomApiPayloads.js — update both when validation rules change.
 */

export interface CreateRoomData {
	password: string;
	roomCode: string;
}

export interface RegisterHostData {
	hostPeerId: string;
	hostSetupToken: string;
}

export interface JoinData {
	identifier: string;
	password: string;
}

type ParseResult<T> =
	| { ok: true; data: T }
	| { ok: false; code: string; message: string };

export function parseCreateRoomBody(
	body: unknown
): ParseResult<CreateRoomData> {
	if (!body || typeof body !== "object") {
		return { ok: false, code: "VALIDATION", message: "Payload fehlt" };
	}
	const b = body as Record<string, unknown>;
	const password = (typeof b.password === "string" ? b.password : "").trim();
	const roomCode = (typeof b.roomCode === "string" ? b.roomCode : "").trim();
	return { ok: true, data: { password, roomCode } };
}

export function parseRegisterHostBody(
	body: unknown
): ParseResult<RegisterHostData> {
	if (!body || typeof body !== "object") {
		return { ok: false, code: "VALIDATION", message: "Payload fehlt" };
	}
	const b = body as Record<string, unknown>;
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

export function parseJoinBody(
	body: unknown,
	roomIdFromRoute = ""
): ParseResult<JoinData> {
	if (!body || typeof body !== "object") {
		return { ok: false, code: "VALIDATION", message: "Payload fehlt" };
	}
	const b = body as Record<string, unknown>;
	const identifier = String(b.identifier ?? b.roomId ?? roomIdFromRoute ?? "").trim();
	const password = (typeof b.password === "string" ? b.password : "").trim();
	if (!identifier) {
		return { ok: false, code: "VALIDATION", message: "identifier erforderlich" };
	}
	return { ok: true, data: { identifier, password } };
}
