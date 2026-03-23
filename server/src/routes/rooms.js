import { Router } from "express";
import { validateCreateRoomPayload, validateRegisterHostPayload } from "../validate.js";
import { hashPassword } from "../password.js";
import {
	listActiveRoomsPublic,
	getRoom as getMediasoupRoom,
	listRoomParticipantNicks,
	countJoinedPeers
} from "../mediasoup/rooms.js";
import { logInfo, logWarn } from "../logger.js";
import { EasymeetErrorCode, sendJsonError, sendValidationJsonError } from "../easymeetErrors.js";

/**
 * @param {{ roomStore: ReturnType<import('../roomStore.js').createRoomStore> }} deps
 */
export function createRoomsRouter(deps) {
	const { roomStore } = deps;
	const { rooms, findRoomByIdentifier, cleanupExpiredRooms, allocateRoomId } = roomStore;

	const router = Router();

	router.post("/rooms", async (req, res) => {
		const parsed = validateCreateRoomPayload(req.body);
		if (!parsed.success) {
			logWarn("POST /api/rooms validation failed", parsed.error?.code, parsed.error?.message);
			sendValidationJsonError(res, parsed.error);
			return;
		}
		const { password, roomCode } = parsed.data;
		const passwordHash = password ? await hashPassword(password) : null;
		const roomId = allocateRoomId(roomCode);
		rooms.set(roomId, {
			passwordHash,
			hostPeerId: null,
			createdAt: Date.now()
		});
		logInfo("room created", { roomId, hasPassword: !!passwordHash });
		res.json({ roomId, hostPeerId: null });
	});

	router.patch("/rooms/:roomId", (req, res) => {
		const { roomId } = req.params;
		const parsed = validateRegisterHostPayload(req.body);
		if (!parsed.success) {
			logWarn("PATCH /api/rooms/:roomId validation failed", parsed.error?.message);
			sendValidationJsonError(res, parsed.error);
			return;
		}
		const room = rooms.get(roomId.toUpperCase());
		if (!room) {
			logWarn("PATCH /api/rooms host register: room not found", roomId);
			sendJsonError(res, 404, EasymeetErrorCode.ROOM_NOT_FOUND, "Room not found");
			return;
		}
		room.hostPeerId = parsed.data.hostPeerId;
		logInfo("host registered", { roomId: roomId.toUpperCase() });
		res.json({ ok: true });
	});

	router.get("/rooms", (req, res) => {
		const identifier = req.query?.identifier ?? "";
		const found = findRoomByIdentifier(identifier);
		const room = found?.room;
		res.json({
			exists: !!room,
			hasPassword: room ? room.passwordHash != null && room.passwordHash !== "" : false
		});
	});

	/** Vor /rooms/:roomId — sonst wird "active" als Raum-ID geparst. */
	router.get("/rooms/active", (req, res) => {
		res.setHeader("Cache-Control", "no-store");
		cleanupExpiredRooms();
		const fromMs = listActiveRoomsPublic();
		const byId = new Map(fromMs.map((r) => [r.roomId, r]));
		for (const httpId of rooms.keys()) {
			const ms = getMediasoupRoom(httpId);
			const n = ms ? countJoinedPeers(ms) : 0;
			if (n < 1) continue;
			if (!byId.has(httpId)) {
				byId.set(httpId, {
					roomId: httpId,
					participantCount: n,
					participants: listRoomParticipantNicks(ms)
				});
			}
		}
		const payload = [...byId.values()]
			.sort((a, b) => a.roomId.localeCompare(b.roomId))
			.map(({ roomId, participantCount, participants = [] }) => {
				const meta = rooms.get(roomId);
				const hasPassword = meta ? meta.passwordHash != null && meta.passwordHash !== "" : false;
				return { roomId, participantCount, hasPassword, participants };
			});
		res.json({ rooms: payload });
	});

	router.get("/rooms/pinned", (req, res) => {
		res.setHeader("Cache-Control", "no-store");
		const list = [];
		for (const [roomId, room] of rooms.entries()) {
			if (!room.persistent) continue;
			list.push({
				roomId,
				hasPassword: room.passwordHash != null && room.passwordHash !== ""
			});
		}
		list.sort((a, b) => a.roomId.localeCompare(b.roomId));
		res.json({ rooms: list });
	});

	router.get("/rooms/:roomId", (req, res) => {
		const identifier = req.query?.identifier ?? req.params.roomId;
		const found = findRoomByIdentifier(identifier);
		const room = found?.room;
		res.json({
			exists: !!room,
			hasPassword: room ? room.passwordHash != null && room.passwordHash !== "" : false
		});
	});

	return router;
}
