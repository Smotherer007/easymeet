import { normalizeRoomCode } from "./roomCode.js";

const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

function generateRoomId() {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let id = "";
	for (let i = 0; i < 6; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * @param {{ roomTtlMs?: number }} [options]
 */
export function createRoomStore(options = {}) {
	const roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
	/** @type {Map<string, { passwordHash: string | null; hostPeerId: string | null; createdAt: number; persistent?: boolean; hostSetupToken?: string | null; name?: string; description?: string; welcomeMessage?: string }>} */
	const rooms = new Map();

	function findRoomByIdentifier(identifier) {
		const id = (identifier || "").trim();
		if (!id) return null;
		const code = normalizeRoomCode(id);
		if (!code) return null;
		const room = rooms.get(code);
		return room ? { roomId: code, room } : null;
	}

	function cleanupExpiredRooms() {
		const now = Date.now();
		for (const [id, room] of rooms.entries()) {
			if (room.persistent) continue;
			if (now - room.createdAt > roomTtlMs) rooms.delete(id);
		}
	}

	function allocateRoomId(preferred) {
		let roomId = (preferred && normalizeRoomCode(preferred)) || null;
		if (!roomId || rooms.has(roomId)) {
			roomId = generateRoomId();
			while (rooms.has(roomId)) roomId = generateRoomId();
		}
		return roomId;
	}

	function upsertPersistentRoomMeta(roomId, meta = {}) {
		const normalizedId = normalizeRoomCode(roomId || "");
		if (!normalizedId) return null;
		const current = rooms.get(normalizedId);
		const createdAt = current?.createdAt ?? Date.now();
		const next = {
			passwordHash: meta.passwordHash ?? current?.passwordHash ?? null,
			hostPeerId: current?.hostPeerId ?? null,
			createdAt,
			persistent: true,
			hostSetupToken: current?.hostSetupToken ?? null,
			name: meta.name ?? current?.name ?? "",
			description: meta.description ?? current?.description ?? "",
			welcomeMessage: meta.welcomeMessage ?? current?.welcomeMessage ?? ""
		};
		rooms.set(normalizedId, next);
		return next;
	}

	function removeRoom(roomId) {
		const normalizedId = normalizeRoomCode(roomId || "");
		if (!normalizedId) return false;
		return rooms.delete(normalizedId);
	}

	return {
		rooms,
		roomTtlMs,
		findRoomByIdentifier,
		cleanupExpiredRooms,
		allocateRoomId,
		upsertPersistentRoomMeta,
		removeRoom
	};
}
