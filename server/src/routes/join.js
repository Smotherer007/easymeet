import { Router } from "express";
import { validateJoinPayload } from "../validate.js";
import { verifyPassword } from "../password.js";
import { issueHandshakeToken, newAssignedPeerId } from "../wsJoinTokens.js";
import { logInfo, logWarn, logError } from "../logger.js";
import { EasymeetErrorCode, sendJsonError, sendValidationJsonError } from "../easymeetErrors.js";

/**
 * @param {{ roomStore: ReturnType<import('../roomStore.js').createRoomStore> }} deps
 */
export function createJoinRouter(deps) {
	const { roomStore } = deps;
	const { findRoomByIdentifier } = roomStore;

	const router = Router();

	router.post("/join", async (req, res) => {
		try {
			const parsed = validateJoinPayload(req.body, req.params?.roomId);
			if (!parsed.success) {
				logWarn("POST /api/join validation failed", parsed.error?.message);
				sendValidationJsonError(res, parsed.error);
				return;
			}
			const { identifier, password: providedPassword } = parsed.data;
			const found = findRoomByIdentifier(identifier);
			if (!found) {
				logWarn("POST /api/join room not found", { identifier: identifier.slice(0, 8) });
				sendJsonError(res, 404, EasymeetErrorCode.ROOM_NOT_FOUND, "Room not found");
				return;
			}
			const { roomId: actualRoomId, room } = found;
			const hasPassword = room.passwordHash != null && room.passwordHash !== "";
			if (hasPassword) {
				const valid = await verifyPassword(providedPassword, room.passwordHash);
				if (!valid) {
					logWarn("POST /api/join invalid password", { roomId: actualRoomId });
					sendJsonError(res, 401, EasymeetErrorCode.INVALID_PASSWORD, "Invalid password");
					return;
				}
			}
			const clientId = req.easymeet?.clientId || "";
			const peerId = newAssignedPeerId();
			const wsToken = issueHandshakeToken(actualRoomId, peerId, clientId);
			logInfo("join ok", { roomId: actualRoomId, peerIdPrefix: peerId.slice(0, 8) });
			res.json({ roomId: actualRoomId, peerId, wsToken });
		} catch (err) {
			logError("POST /api/join exception", err?.message || err);
			sendJsonError(res, 500, EasymeetErrorCode.INTERNAL_ERROR, "Internal server error");
		}
	});

	return router;
}
