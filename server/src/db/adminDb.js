import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { normalizeRoomCode } from "../roomCode.js";
import { hashPassword } from "../password.js";

function toIsoNow() {
	return new Date().toISOString();
}

function resolveDbPath(rawPath) {
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

function sanitizeClientId(raw) {
	if (typeof raw !== "string") return "";
	const v = raw.trim().slice(0, 128);
	return /^[a-zA-Z0-9_-]{8,128}$/.test(v) ? v : "";
}

function ensureDirForFile(filePath) {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
}

function toRoomMetaRow(row) {
	return {
		roomId: row.room_id,
		name: row.name || "",
		description: row.description || "",
		welcomeMessage: row.welcome_message || "",
		passwordHash: row.password_hash || null,
		createdAt: row.created_at || toIsoNow(),
		updatedAt: row.updated_at || toIsoNow()
	};
}

/**
 * @param {{ dbPath?: string }} [options]
 */
export function createAdminDb(options = {}) {
	const dbPath = resolveDbPath(options.dbPath || process.env.EASYMEET_DB_PATH || "/app/data/easymeet.sqlite");
	ensureDirForFile(dbPath);
	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	/* synchronous=NORMAL is the recommended/safe companion to WAL: fewer fsyncs
	 * per write while preserving durability across crashes (just not power loss
	 * mid-checkpoint). Noticeable on small repeated writes (admin grants). */
	db.pragma("synchronous = NORMAL");

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
	const getPersistentRoomStmt = db.prepare(`
		SELECT room_id, name, description, welcome_message, password_hash, created_at, updated_at
		FROM persistent_rooms
		WHERE room_id = ?
	`);
	const createPersistentRoomStmt = db.prepare(`
		INSERT INTO persistent_rooms (room_id, name, description, welcome_message, password_hash, created_at, updated_at)
		VALUES (@roomId, @name, @description, @welcomeMessage, @passwordHash, @createdAt, @updatedAt)
	`);
	const deletePersistentRoomStmt = db.prepare(`DELETE FROM persistent_rooms WHERE room_id = ?`);

	function isServerAdmin(clientIdRaw) {
		const clientId = sanitizeClientId(clientIdRaw);
		if (!clientId) return false;
		return Boolean(hasServerAdminStmt.get(clientId));
	}

	function grantServerAdmin(clientIdRaw) {
		const clientId = sanitizeClientId(clientIdRaw);
		if (!clientId) return false;
		insertServerAdminStmt.run(clientId, toIsoNow());
		return true;
	}

	function listPersistentRooms() {
		return listPersistentRoomsStmt.all().map(toRoomMetaRow);
	}

	function getPersistentRoom(roomIdRaw) {
		const roomId = normalizeRoomCode(String(roomIdRaw || ""));
		if (!roomId) return null;
		const row = getPersistentRoomStmt.get(roomId);
		return row ? toRoomMetaRow(row) : null;
	}

	async function createPersistentRoom({ roomId: roomIdRaw, name = "", description = "", welcomeMessage = "", password = "" }) {
		const roomId = normalizeRoomCode(String(roomIdRaw || ""));
		if (!roomId) return null;
		const nowIso = toIsoNow();
		const passwordHash = password ? await hashPassword(String(password)) : null;
		createPersistentRoomStmt.run({
			roomId,
			name: String(name || "").trim().slice(0, 120),
			description: String(description || "").trim().slice(0, 500),
			welcomeMessage: String(welcomeMessage || "").trim().slice(0, 1200),
			passwordHash,
			createdAt: nowIso,
			updatedAt: nowIso
		});
		return getPersistentRoom(roomId);
	}

	function deletePersistentRoom(roomIdRaw) {
		const roomId = normalizeRoomCode(String(roomIdRaw || ""));
		if (!roomId) return false;
		const info = deletePersistentRoomStmt.run(roomId);
		return info.changes > 0;
	}

	/**
	 * @returns {{ token: string; created: boolean }}
	 *   created === true only on first generation — callers can gate
	 *   one-time secret logging on that flag.
	 */
	function getOrCreateBootstrapToken() {
		const existing = getBootstrapTokenStmt.get();
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
		getPersistentRoom,
		createPersistentRoom,
		deletePersistentRoom,
		getOrCreateBootstrapToken
	};
}

