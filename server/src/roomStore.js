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
	/** @type {Map<string, { passwordHash: string | null; hostPeerId: string | null; createdAt: number; persistent?: boolean; hostSetupToken?: string | null }>} */
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

	return {
		rooms,
		roomTtlMs,
		findRoomByIdentifier,
		cleanupExpiredRooms,
		allocateRoomId
	};
}
