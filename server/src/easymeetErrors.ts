import { getLogContext } from "./logger.ts";

export const EasymeetErrorCode = {
	ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
	INVALID_PASSWORD: "INVALID_PASSWORD",
	INTERNAL_ERROR: "INTERNAL_ERROR",
	WS_PATH_NOT_FOUND: "WS_PATH_NOT_FOUND",
	WS_TOKEN_INVALID: "WS_TOKEN_INVALID",
	WS_HANDSHAKE_INVALID: "WS_HANDSHAKE_INVALID",
	WS_URL_TOKEN_MISMATCH: "WS_URL_TOKEN_MISMATCH",
	PEER_ALREADY_JOINED: "PEER_ALREADY_JOINED",
	TRANSPORT_CREATE_FAILED: "TRANSPORT_CREATE_FAILED",
	TRANSPORT_NOT_FOUND: "TRANSPORT_NOT_FOUND",
	NOT_JOINED: "NOT_JOINED",
	UNKNOWN_PROTOO_METHOD: "UNKNOWN_PROTOO_METHOD",
	CONNECTION_FAILED: "CONNECTION_FAILED",
	INVALID_HOST_TOKEN: "INVALID_HOST_TOKEN",
	HOST_REGISTRATION_DISABLED: "HOST_REGISTRATION_DISABLED",
	PERMISSION_DENIED: "PERMISSION_DENIED",
	ROOM_ALREADY_EXISTS: "ROOM_ALREADY_EXISTS",
};

export function jsonErrorBody(code: string, message: string): Record<string, string> {
	const requestId = getLogContext().requestId;
	const body: Record<string, string> = { code, message };
	if (requestId) body.requestId = requestId;
	return body;
}

export function sendJsonError(res: import("express").Response, status: number, code: string, message: string): void {
	res.status(status).json(jsonErrorBody(code, message));
}

export function sendValidationJsonError(res: import("express").Response, err: { code: string; message: string }): void {
	res.status(400).json(jsonErrorBody(err.code, err.message));
}

export function protooErrorReason(code: string, message: string): string {
	return `[${code}] ${message}`;
}
