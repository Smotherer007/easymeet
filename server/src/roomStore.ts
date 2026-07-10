import { normalizeRoomCode } from "./roomCode.ts";

const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export interface RoomMeta {
	passwordHash: string | null;
	hostPeerId: string | null;
	createdAt: number;
	persistent?: boolean;
	hostSetupToken?: string | null;
	name?: string;
	description?: string;
	welcomeMessage?: string;
}

export interface RoomStore {
	rooms: Map<string, RoomMeta>;
	roomTtlMs: number;
	findRoomByIdentifier: (identifier: string) => { roomId: string; room: RoomMeta } | null;
	cleanupExpiredRooms: () => void;
	allocateRoomId: (preferred?: string) => string;
	upsertPersistentRoomMeta: (roomId: string, meta?: Partial<RoomMeta>) => RoomMeta | null;
	removeRoom: (roomId: string) => boolean;
}

function generateRoomId(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let id = "";
	for (let i = 0; i < 6; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

export function createRoomStore(options: { roomTtlMs?: number } = {}): RoomStore {
	const roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
	const rooms = new Map<string, RoomMeta>();

	function findRoomByIdentifier(identifier: string): { roomId: string; room: RoomMeta } | null {
		const id = (identifier || "").trim();
		if (!id) return null;
		const code = normalizeRoomCode(id);
		if (!code) return null;
		const room = rooms.get(code);
		return room ? { roomId: code, room } : null;
	}

	function cleanupExpiredRooms(): void {
		const now = Date.now();
		for (const [id, room] of rooms.entries()) {
			if (room.persistent) continue;
			if (now - room.createdAt > roomTtlMs) rooms.delete(id);
		}
	}

	function allocateRoomId(preferred?: string): string {
		let roomId = (preferred && normalizeRoomCode(preferred)) || null;
		if (!roomId || rooms.has(roomId)) {
			roomId = generateRoomId();
			while (rooms.has(roomId)) roomId = generateRoomId();
		}
		return roomId;
	}

	function upsertPersistentRoomMeta(roomId: string, meta: Partial<RoomMeta> = {}): RoomMeta | null {
		const normalizedId = normalizeRoomCode(roomId || "");
		if (!normalizedId) return null;
		const current = rooms.get(normalizedId);
		const createdAt = current?.createdAt ?? Date.now();
		const next: RoomMeta = {
			passwordHash: meta.passwordHash ?? current?.passwordHash ?? null,
			hostPeerId: current?.hostPeerId ?? null,
			createdAt,
			persistent: true,
			hostSetupToken: current?.hostSetupToken ?? null,
			name: meta.name ?? current?.name ?? "",
			description: meta.description ?? current?.description ?? "",
			welcomeMessage: meta.welcomeMessage ?? current?.welcomeMessage ?? "",
		};
		rooms.set(normalizedId, next);
		return next;
	}

	function removeRoom(roomId: string): boolean {
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
		removeRoom,
	};
}
