/**
 * Unified error codes for HTTP JSON and Protoo reason strings ([CODE] message).
 */

import { getLogContext } from "./logger.js";

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
	GIFS_TENOR_ERROR: "GIFS_TENOR_ERROR",
	INVALID_HOST_TOKEN: "INVALID_HOST_TOKEN",
	HOST_REGISTRATION_DISABLED: "HOST_REGISTRATION_DISABLED",
	PERMISSION_DENIED: "PERMISSION_DENIED",
	ROOM_ALREADY_EXISTS: "ROOM_ALREADY_EXISTS"
};

/**
 * @param {string} code
 * @param {string} message
 * @returns {Record<string, string>}
 */
export function jsonErrorBody(code, message) {
	const requestId = getLogContext().requestId;
	/** @type {Record<string, string>} */
	const body = { code, message };
	if (requestId) body.requestId = requestId;
	return body;
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
export function sendJsonError(res, status, code, message) {
	res.status(status).json(jsonErrorBody(code, message));
}

/**
 * @param {import('express').Response} res
 * @param {{ code: string; message: string }} err
 */
export function sendValidationJsonError(res, err) {
	res.status(400).json(jsonErrorBody(err.code, err.message));
}

/**
 * Protoo reject(reason) — stable [CODE] prefix for logs and optional client parsing.
 * @param {string} code
 * @param {string} message
 */
export function protooErrorReason(code, message) {
	return `[${code}] ${message}`;
}
