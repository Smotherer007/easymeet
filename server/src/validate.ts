import {
	parseCreateRoomBody,
	parseRegisterHostBody,
	parseJoinBody,
	type CreateRoomData,
	type RegisterHostData,
	type JoinData,
} from "./shared/roomApiPayloads.ts";

type ValidResult<T> = { success: true; data: T };
type InvalidResult = { success: false; error: { code: string; message: string } };

export function validateCreateRoomPayload(
	body: unknown
): ValidResult<CreateRoomData> | InvalidResult {
	const r = parseCreateRoomBody(body);
	if (!r.ok) return { success: false, error: { code: r.code, message: r.message } };
	return { success: true, data: r.data };
}

export function validateRegisterHostPayload(
	body: unknown
): ValidResult<RegisterHostData> | InvalidResult {
	const r = parseRegisterHostBody(body);
	if (!r.ok) return { success: false, error: { code: r.code, message: r.message } };
	return { success: true, data: r.data };
}

export function validateJoinPayload(
	body: unknown,
	roomIdParam = ""
): ValidResult<JoinData> | InvalidResult {
	const r = parseJoinBody(body, roomIdParam);
	if (!r.ok) return { success: false, error: { code: r.code, message: r.message } };
	return { success: true, data: r.data };
}
