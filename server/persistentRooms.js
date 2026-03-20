/**
 * Beim Start: feste Räume aus JSON-Datei; von TTL-Bereinigung ausgenommen (persistent).
 *
 * Pfad in **EASYMEET_PERSISTENT_ROOMS** (relativ zum Arbeitsverzeichnis des Prozesses oder absolut).
 */
import fs from 'fs';
import path from 'path';
import { normalizeRoomCode } from './roomCode.js';
import { hashPassword } from './password.js';

function resolveConfigPath() {
  const raw = process.env.EASYMEET_PERSISTENT_ROOMS?.trim();
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function readPlainPassword(entry) {
  if (entry.passwordEnv) {
    const k = String(entry.passwordEnv).trim();
    return k ? String(process.env[k] ?? '') : '';
  }
  if (entry.password != null) return String(entry.password);
  return '';
}

function parseRoomsArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray(raw.rooms)) return raw.rooms;
  return null;
}

/**
 * @param {unknown[]} list
 * @param {Map<string, object>} roomsMap
 * @param {string} sourceLabel
 */
async function applyRoomListToMap(list, roomsMap, sourceLabel) {
  if (!list || list.length === 0) {
    console.warn('[easymeet] persistent-rooms: keine Einträge in', sourceLabel);
    return { loaded: 0, path: sourceLabel };
  }

  const seen = new Set();
  let count = 0;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const roomId = normalizeRoomCode(String(entry.id ?? entry.roomId ?? ''));
    if (!roomId) {
      console.warn('[easymeet] persistent-rooms: übersprungen (ungültige id):', entry.id ?? entry.roomId);
      continue;
    }
    if (seen.has(roomId)) {
      console.warn('[easymeet] persistent-rooms: doppelte id, späterer Eintrag überschreibt:', roomId);
    }
    seen.add(roomId);

    const plain = readPlainPassword(entry).trim();
    const passwordHash = plain ? await hashPassword(plain) : null;

    roomsMap.set(roomId, {
      passwordHash,
      hostPeerId: null,
      createdAt: Date.now(),
      persistent: true,
    });
    count++;
  }

  console.log(`[easymeet] persistent-rooms: ${count} Raum/Räume aus ${sourceLabel} geladen (TTL ausgenommen)`);
  return { loaded: count, path: sourceLabel };
}

/**
 * @param {Map<string, object>} roomsMap
 * @returns {Promise<{ loaded: number; path: string; skipped?: boolean; error?: boolean }>}
 */
export async function applyPersistentRooms(roomsMap) {
  const configPath = resolveConfigPath();
  if (!configPath) {
    console.log(
      '[easymeet] persistent-rooms: optional – EASYMEET_PERSISTENT_ROOMS in .env setzen (Pfad zur JSON), siehe config/persistent-rooms.example.json'
    );
    return { loaded: 0, path: '(nicht gesetzt)', skipped: true };
  }

  if (!fs.existsSync(configPath)) {
    console.log('[easymeet] persistent-rooms: Datei fehlt:', configPath);
    return { loaded: 0, path: configPath, skipped: true };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('[easymeet] persistent-rooms: JSON ungültig:', configPath, e?.message || e);
    return { loaded: 0, path: configPath, error: true };
  }

  const list = parseRoomsArray(raw);
  if (!list || list.length === 0) {
    console.warn('[easymeet] persistent-rooms: keine Einträge in', configPath);
    return { loaded: 0, path: configPath };
  }

  return applyRoomListToMap(list, roomsMap, configPath);
}
