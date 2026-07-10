import crypto from "node:crypto";
import { Router } from "express";
import { validateCreateRoomPayload, validateRegisterHostPayload } from "../validate.ts";
import { hashPassword } from "../password.ts";
import {
	listActiveRoomsPublic,
	getRoom as getMediasoupRoom,
	listRoomParticipantNicks,
	countJoinedPeers,
} from "../mediasoup/rooms.ts";
import { logInfo, logWarn } from "../logger.ts";
import { EasymeetErrorCode, sendJsonError, sendValidationJsonError } from "../easymeetErrors.ts";
import { sanitizeClientId } from "../authz.ts";
import type { RoomStore } from "../roomStore.ts";
import type { createAdminDb } from "../db/adminDb.ts";

type AdminDb = ReturnType<typeof createAdminDb>;

function hostSetupTokensEqual(a: string, b: string): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	const ha = crypto.createHash("sha256").update(a, "utf8").digest();
	const hb = crypto.createHash("sha256").update(b, "utf8").digest();
	return crypto.timingSafeEqual(ha, hb);
}

function safeTokenEquals(a: string, b: string): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	const ha = crypto.createHash("sha256").update(a, "utf8").digest();
	const hb = crypto.createHash("sha256").update(b, "utf8").digest();
	return crypto.timingSafeEqual(ha, hb);
}

export function createRoomsRouter(deps: {
	roomStore: RoomStore;
	adminDb: AdminDb;
	bootstrapAdminToken: string;
}) {
	const { roomStore, adminDb, bootstrapAdminToken } = deps;
	const { rooms, findRoomByIdentifier, cleanupExpiredRooms, allocateRoomId, upsertPersistentRoomMeta, removeRoom } = roomStore;

	const router = Router();

	function requireServerAdmin(req: import("express").Request, res: import("express").Response): string | null {
		const clientId = req.easymeet?.clientId || "";
		if (!adminDb.isServerAdmin(clientId)) {
			sendJsonError(res, 403, EasymeetErrorCode.PERMISSION_DENIED, "Server admin required");
			return null;
		}
		return clientId;
	}

	router.post("/admin/bootstrap-login", (req, res) => {
		const clientId = req.easymeet?.clientId || "";
		const token = String(req.body?.token || "");
		if (!sanitizeClientId(clientId)) {
			sendJsonError(res, 400, "INVALID_CLIENT_ID", "Valid client identity required");
			return;
		}
		if (!token || !safeTokenEquals(token, bootstrapAdminToken)) {
			sendJsonError(res, 403, "INVALID_BOOTSTRAP_TOKEN", "Invalid bootstrap token");
			return;
		}
		adminDb.grantServerAdmin(clientId);
		logInfo("server admin granted", { clientId });
		res.json({ ok: true, role: "serverAdmin" });
	});

	router.get("/admin/me", (req, res) => {
		const clientId = req.easymeet?.clientId || "";
		res.json({
			clientId,
			isServerAdmin: adminDb.isServerAdmin(clientId),
		});
	});

	router.post("/rooms", async (req, res) => {
		const parsed = validateCreateRoomPayload(req.body);
		if (!parsed.success) {
			logWarn("POST /api/rooms validation failed", String(parsed.error?.code), String(parsed.error?.message));
			sendValidationJsonError(res, parsed.error);
			return;
		}
		const { password, roomCode } = parsed.data;
		const passwordHash = password ? await hashPassword(password) : null;
		const roomId = allocateRoomId(roomCode);
		rooms.set(roomId, {
			passwordHash,
			hostPeerId: null,
			createdAt: Date.now(),
			hostSetupToken: null,
		});
		logInfo("room created", { roomId, hasPassword: !!passwordHash });
		res.json({ roomId, hostPeerId: null });
	});

	router.post("/admin/persistent-rooms", async (req, res) => {
		if (!requireServerAdmin(req, res)) return;
		const roomCode = String(req.body?.roomCode || "");
		const roomId = allocateRoomId(roomCode);
		let created;
		try {
			created = await adminDb.createPersistentRoom({
				roomId,
				name: String(req.body?.name || ""),
				description: String(req.body?.description || ""),
				welcomeMessage: String(req.body?.welcomeMessage || ""),
				password: String(req.body?.password || ""),
			});
		} catch (e) {
			if (String((e as { code?: string })?.code || "").startsWith("SQLITE_CONSTRAINT")) {
				sendJsonError(res, 409, EasymeetErrorCode.ROOM_ALREADY_EXISTS, "Persistent room already exists");
				return;
			}
			throw e;
		}
		if (!created) {
			sendJsonError(res, 400, "PERSISTENT_ROOM_CREATE_FAILED", "Could not create persistent room");
			return;
		}
		upsertPersistentRoomMeta(created.roomId, {
			passwordHash: created.passwordHash,
			name: created.name,
			description: created.description,
			welcomeMessage: created.welcomeMessage,
		});
		res.json({ room: created });
	});

	router.delete("/admin/persistent-rooms/:roomId", (req, res) => {
		if (!requireServerAdmin(req, res)) return;
		const ok = adminDb.deletePersistentRoom(req.params.roomId);
		if (!ok) {
			sendJsonError(res, 404, EasymeetErrorCode.ROOM_NOT_FOUND, "Persistent room not found");
			return;
		}
		removeRoom(req.params.roomId);
		res.json({ ok: true });
	});

	router.patch("/rooms/:roomId", (req, res) => {
		const { roomId } = req.params;
		const parsed = validateRegisterHostPayload(req.body);
		if (!parsed.success) {
			logWarn("PATCH /api/rooms/:roomId validation failed", String(parsed.error?.message));
			sendValidationJsonError(res, parsed.error);
			return;
		}
		const room = rooms.get(roomId.toUpperCase());
		if (!room) {
			logWarn("PATCH /api/rooms host register: room not found", roomId);
			sendJsonError(res, 404, EasymeetErrorCode.ROOM_NOT_FOUND, "Room not found");
			return;
		}
		if (!room.hostSetupToken) {
			logWarn("PATCH /api/rooms host register: no hostSetupToken on room", roomId);
			sendJsonError(res, 403, EasymeetErrorCode.HOST_REGISTRATION_DISABLED, "Host registration is disabled for this room");
			return;
		}
		if (!hostSetupTokensEqual(parsed.data.hostSetupToken, room.hostSetupToken)) {
			logWarn("PATCH /api/rooms host register: invalid hostSetupToken", roomId);
			sendJsonError(res, 403, EasymeetErrorCode.INVALID_HOST_TOKEN, "Invalid host setup token");
			return;
		}
		room.hostPeerId = parsed.data.hostPeerId;
		logInfo("host registered", { roomId: roomId.toUpperCase() });
		res.json({ ok: true });
	});

	router.get("/rooms", (req, res) => {
		const identifier = String(req.query?.identifier ?? "");
		const found = findRoomByIdentifier(identifier);
		const room = found?.room;
		res.json({
			exists: !!room,
			hasPassword: room ? room.passwordHash != null && room.passwordHash !== "" : false,
		});
	});

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
					participants: listRoomParticipantNicks(ms),
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
		const list: Array<{
			roomId: string;
			hasPassword: boolean;
			name: string;
			description: string;
			welcomeMessage: string;
		}> = [];
		for (const [roomId, room] of rooms.entries()) {
			if (!room.persistent) continue;
			list.push({
				roomId,
				hasPassword: room.passwordHash != null && room.passwordHash !== "",
				name: room.name || "",
				description: room.description || "",
				welcomeMessage: room.welcomeMessage || "",
			});
		}
		list.sort((a, b) => a.roomId.localeCompare(b.roomId));
		res.json({ rooms: list });
	});

	router.get("/rooms/:roomId", (req, res) => {
		const identifier = String(req.query?.identifier ?? req.params.roomId);
		const found = findRoomByIdentifier(identifier);
		const room = found?.room;
		res.json({
			exists: !!room,
			hasPassword: room ? room.passwordHash != null && room.passwordHash !== "" : false,
		});
	});

	return router;
}
