/**
 * On startup: load pinned rooms from JSON; excluded from TTL cleanup (persistent).
 *
 * - **EASYMEET_PERSISTENT_ROOMS_JSON**: raw JSON string (optional; wins over file).
 * - **EASYMEET_PERSISTENT_ROOMS**: path to JSON file (absolute, or relative to **repository root**).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeRoomCode } from "./roomCode.js";
import { hashPassword } from "./password.js";
import { logInfo, logWarn, logError } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function resolveConfigPath() {
	const raw = process.env.EASYMEET_PERSISTENT_ROOMS?.trim();
	if (!raw) return null;
	return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

function readPlainPassword(entry) {
	if (entry.passwordEnv) {
		const k = String(entry.passwordEnv).trim();
		return k ? String(process.env[k] ?? "") : "";
	}
	if (entry.password != null) return String(entry.password);
	return "";
}

function parseRoomsArray(raw) {
	if (Array.isArray(raw)) return raw;
	if (raw && typeof raw === "object" && Array.isArray(raw.rooms)) return raw.rooms;
	return null;
}

/**
 * @param {unknown[]} list
 * @param {Map<string, object>} roomsMap
 * @param {string} sourceLabel
 */
async function applyRoomListToMap(list, roomsMap, sourceLabel) {
	if (!list || list.length === 0) {
		logWarn("persistent-rooms: no entries in", sourceLabel);
		return { loaded: 0, path: sourceLabel };
	}

	const seen = new Set();
	let count = 0;
	for (const entry of list) {
		if (!entry || typeof entry !== "object") continue;
		const roomId = normalizeRoomCode(String(entry.id ?? entry.roomId ?? ""));
		if (!roomId) {
			logWarn("persistent-rooms: skipped (invalid id)", entry.id ?? entry.roomId);
			continue;
		}
		if (seen.has(roomId)) {
			logWarn("persistent-rooms: duplicate id, later entry overwrites", roomId);
		}
		seen.add(roomId);

		const plain = readPlainPassword(entry).trim();
		const passwordHash = plain ? await hashPassword(plain) : null;
		const rawTok =
			entry.hostSetupToken != null && typeof entry.hostSetupToken === "string"
				? entry.hostSetupToken.trim().slice(0, 256)
				: "";
		const hostSetupToken = rawTok.length >= 16 ? rawTok : null;

		roomsMap.set(roomId, {
			passwordHash,
			hostPeerId: null,
			createdAt: Date.now(),
			persistent: true,
			hostSetupToken
		});
		count++;
	}

	logInfo(`persistent-rooms: ${count} room(s) loaded from ${sourceLabel} (TTL excluded)`);
	return { loaded: count, path: sourceLabel };
}

/**
 * @param {Map<string, object>} roomsMap
 * @returns {Promise<{ loaded: number; path: string; skipped?: boolean; error?: boolean }>}
 */
export async function applyPersistentRooms(roomsMap) {
	const fromEnv = process.env.EASYMEET_PERSISTENT_ROOMS_JSON?.trim();
	if (fromEnv) {
		let raw;
		try {
			raw = JSON.parse(fromEnv);
		} catch (e) {
			logError("persistent-rooms: invalid JSON in EASYMEET_PERSISTENT_ROOMS_JSON", e?.message || e);
			return { loaded: 0, path: "(env EASYMEET_PERSISTENT_ROOMS_JSON)", error: true };
		}
		const list = parseRoomsArray(raw);
		if (!list || list.length === 0) {
			logWarn("persistent-rooms: no entries in EASYMEET_PERSISTENT_ROOMS_JSON");
			return { loaded: 0, path: "(env EASYMEET_PERSISTENT_ROOMS_JSON)" };
		}
		return applyRoomListToMap(list, roomsMap, "(env EASYMEET_PERSISTENT_ROOMS_JSON)");
	}

	const configPath = resolveConfigPath();
	if (!configPath) {
		logInfo("persistent-rooms: optional — set EASYMEET_PERSISTENT_ROOMS (path), EASYMEET_PERSISTENT_ROOMS_JSON, see persistent-rooms.example.json");
		return { loaded: 0, path: "(not set)", skipped: true };
	}

	if (!fs.existsSync(configPath)) {
		logInfo("persistent-rooms: file missing", configPath);
		return { loaded: 0, path: configPath, skipped: true };
	}

	let raw;
	try {
		raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
	} catch (e) {
		logError("persistent-rooms: invalid JSON", configPath, e?.message || e);
		return { loaded: 0, path: configPath, error: true };
	}

	const list = parseRoomsArray(raw);
	if (!list || list.length === 0) {
		logWarn("persistent-rooms: no entries in", configPath);
		return { loaded: 0, path: configPath };
	}

	return applyRoomListToMap(list, roomsMap, configPath);
}
