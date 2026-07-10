import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { normalizeRoomCode } from "../roomCode.ts";
import { hashPassword } from "../password.ts";

export interface RoomMeta {
	roomId: string;
	name: string;
	description: string;
	welcomeMessage: string;
	passwordHash: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface PersistentRoomInput {
	roomId: string;
	name?: string;
	description?: string;
	welcomeMessage?: string;
	password?: string;
}

interface SqliteRoomRow {
	room_id: string;
	name: string | null;
	description: string | null;
	welcome_message: string | null;
	password_hash: string | null;
	created_at: string;
	updated_at: string;
}

function toIsoNow(): string {
	return new Date().toISOString();
}

function resolveDbPath(rawPath: string): string {
	const trimmed = String(rawPath || "").trim();
	if (!trimmed) {
		if (fs.existsSync("/app")) return "/app/data/easymeet.sqlite";
		return path.resolve(process.cwd(), "data/easymeet.sqlite");
	}
	if (trimmed.startsWith("/app/") && !fs.existsSync("/app")) {
		return path.resolve(process.cwd(), "data/easymeet.sqlite");
	}
	return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

function sanitizeClientId(raw: string): string {
	if (typeof raw !== "string") return "";
	const v = raw.trim().slice(0, 128);
	return /^[a-zA-Z0-9_-]{8,128}$/.test(v) ? v : "";
}

function ensureDirForFile(filePath: string): void {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
}

function toRoomMetaRow(row: SqliteRoomRow): RoomMeta {
	return {
		roomId: row.room_id,
		name: row.name || "",
		description: row.description || "",
		welcomeMessage: row.welcome_message || "",
		passwordHash: row.password_hash || null,
		createdAt: row.created_at || toIsoNow(),
		updatedAt: row.updated_at || toIsoNow(),
	};
}

export function createAdminDb(options: { dbPath?: string } = {}) {
	const dbPath = resolveDbPath(options.dbPath || process.env.EASYMEET_DB_PATH || "/app/data/easymeet.sqlite");
	ensureDirForFile(dbPath);
	const db = new DatabaseSync(dbPath);
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = NORMAL");

	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS server_admin_identities (
			client_id TEXT PRIMARY KEY,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS server_admin_bootstrap (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			token TEXT NOT NULL,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS persistent_rooms (
			room_id TEXT PRIMARY KEY,
			name TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '',
			welcome_message TEXT NOT NULL DEFAULT '',
			password_hash TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`);

	const insertServerAdminStmt = db.prepare(`
		INSERT OR IGNORE INTO server_admin_identities (client_id, created_at)
		VALUES (?, ?)
	`);
	const hasServerAdminStmt = db.prepare(`SELECT 1 AS ok FROM server_admin_identities WHERE client_id = ?`);
	const getBootstrapTokenStmt = db.prepare(`SELECT token FROM server_admin_bootstrap WHERE id = 1`);
	const setBootstrapTokenStmt = db.prepare(`
		INSERT INTO server_admin_bootstrap (id, token, created_at)
		VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET token = excluded.token
	`);
	const listPersistentRoomsStmt = db.prepare(`
		SELECT room_id, name, description, welcome_message, password_hash, created_at, updated_at
		FROM persistent_rooms
		ORDER BY room_id ASC
	`);
	const createPersistentRoomStmt = db.prepare(`
		INSERT INTO persistent_rooms (room_id, name, description, welcome_message, password_hash, created_at, updated_at)
		VALUES (@roomId, @name, @description, @welcomeMessage, @passwordHash, @createdAt, @updatedAt)
	`);
	const deletePersistentRoomStmt = db.prepare(`DELETE FROM persistent_rooms WHERE room_id = ?`);

	function isServerAdmin(clientIdRaw: string): boolean {
		const clientId = sanitizeClientId(clientIdRaw);
		if (!clientId) return false;
		return Boolean(hasServerAdminStmt.get(clientId));
	}

	function grantServerAdmin(clientIdRaw: string): boolean {
		const clientId = sanitizeClientId(clientIdRaw);
		if (!clientId) return false;
		insertServerAdminStmt.run(clientId, toIsoNow());
		return true;
	}

	function listPersistentRooms(): RoomMeta[] {
		return (listPersistentRoomsStmt.all() as unknown as SqliteRoomRow[]).map(toRoomMetaRow);
	}

	async function createPersistentRoom(input: PersistentRoomInput): Promise<RoomMeta | null> {
		const roomId = normalizeRoomCode(String(input.roomId || ""));
		if (!roomId) return null;
		const nowIso = toIsoNow();
		const passwordHash = input.password ? await hashPassword(String(input.password)) : null;
		createPersistentRoomStmt.run({
			roomId,
			name: String(input.name || "").trim().slice(0, 120),
			description: String(input.description || "").trim().slice(0, 500),
			welcomeMessage: String(input.welcomeMessage || "").trim().slice(0, 1200),
			passwordHash,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		const row = db
			.prepare(
				`SELECT room_id, name, description, welcome_message, password_hash, created_at, updated_at
			 FROM persistent_rooms WHERE room_id = ?`
			)
			.get(roomId) as SqliteRoomRow | undefined;
		return row ? toRoomMetaRow(row) : null;
	}

	function deletePersistentRoom(roomIdRaw: string): boolean {
		const roomId = normalizeRoomCode(String(roomIdRaw || ""));
		if (!roomId) return false;
		const info = deletePersistentRoomStmt.run(roomId);
		return info.changes > 0;
	}

	function getOrCreateBootstrapToken(): { token: string; created: boolean } {
		const existing = getBootstrapTokenStmt.get() as { token?: string } | undefined;
		if (existing?.token) return { token: String(existing.token), created: false };
		const token = crypto.randomBytes(24).toString("hex");
		setBootstrapTokenStmt.run(token, toIsoNow());
		return { token, created: true };
	}

	return {
		dbPath,
		close: () => db.close(),
		isServerAdmin,
		grantServerAdmin,
		listPersistentRooms,
		createPersistentRoom,
		deletePersistentRoom,
		getOrCreateBootstrapToken,
	};
}
