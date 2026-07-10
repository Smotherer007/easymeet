import { Router } from "express";
import { validateJoinPayload } from "../validate.ts";
import { verifyPassword } from "../password.ts";
import { issueHandshakeToken, newAssignedPeerId } from "../wsJoinTokens.ts";
import { logInfo, logWarn, logError } from "../logger.ts";
import { EasymeetErrorCode, sendJsonError, sendValidationJsonError } from "../easymeetErrors.ts";
import type { RoomStore } from "../roomStore.ts";

export function createJoinRouter(deps: { roomStore: RoomStore }) {
	const { roomStore } = deps;
	const { findRoomByIdentifier } = roomStore;

	const router = Router();

	router.post("/join", async (req, res) => {
		try {
			const parsed = validateJoinPayload(req.body, (req.params as Record<string, string>)?.roomId);
			if (!parsed.success) {
				logWarn("POST /api/join validation failed", String(parsed.error?.message));
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
				const valid = await verifyPassword(providedPassword, room.passwordHash!);
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
			logError("POST /api/join exception", (err as Error)?.message || err);
			sendJsonError(res, 500, EasymeetErrorCode.INTERNAL_ERROR, "Internal server error");
		}
	});

	return router;
}
