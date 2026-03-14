/**
 * I/O: API-Aufrufe mit Result-Typ.
 */

import { ok, err } from '../../shared/result.js';
import { API_BASE } from '../../shared/constants.js';

/**
 * @param {unknown} payload
 * @returns {import('../../shared/result.js').Result<{ password: string; roomCode: string }>}
 */
export function validateCreateRoomPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return err('VALIDATION', 'Payload fehlt');
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const password = String(p.password ?? '').trim();
  const roomCode = String(p.roomCode ?? '').trim();
  return ok({ password, roomCode });
}

/**
 * @param {unknown} payload
 * @returns {import('../../shared/result.js').Result<{ identifier: string; password: string; peerId: string }>}
 */
export function validateJoinPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return err('VALIDATION', 'Payload fehlt');
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const identifier = String(p.identifier ?? p.roomId ?? '').trim();
  const password = String(p.password ?? '').trim();
  const peerId = String(p.peerId ?? '');
  if (!identifier || !peerId) {
    return err('VALIDATION', 'identifier und peerId erforderlich');
  }
  return ok({ identifier, password, peerId });
}

/**
 * @param {string} password
 * @param {string} roomCode
 * @returns {Promise<import('../../shared/result.js').Result<{ roomId: string }>>}
 */
export async function fetchCreateRoom(password, roomCode) {
  try {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, roomCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return err('API', data.error || 'Raum konnte nicht erstellt werden');
    }
    return ok({
      roomId: data.roomId ?? '',
    });
  } catch (e) {
    return err('NETWORK', 'Verbindung fehlgeschlagen', e);
  }
}

/**
 * @param {string} roomId
 * @param {string} hostPeerId
 * @returns {Promise<import('../../shared/result.js').Result<void>>}
 */
export async function fetchRegisterHost(roomId, hostPeerId) {
  try {
    const res = await fetch(`${API_BASE}/rooms/${roomId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostPeerId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return err('API', data.error || 'Host konnte nicht registriert werden');
    }
    return ok(undefined);
  } catch (e) {
    return err('NETWORK', 'Verbindung fehlgeschlagen', e);
  }
}

function normalizeRoomIdentifier(id) {
  return (id || '').trim().replace(/[^A-Z0-9]/gi, '').toUpperCase() || (id || '').trim();
}

/**
 * @param {string} identifier
 * @param {string} password
 * @param {string} peerId
 * @returns {Promise<import('../../shared/result.js').Result<{ hostPeerId: string; roomId: string }>>}
 */
export async function fetchJoinRoom(identifier, password, peerId) {
  try {
    const normalized = normalizeRoomIdentifier(identifier) || (identifier || '').trim();
    const res = await fetch(`${API_BASE}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: normalized || identifier, password, peerId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return err('API', data.error || 'Beitritt fehlgeschlagen');
    }
    return ok({
      hostPeerId: data.hostPeerId ?? '',
      roomId: data.roomId ?? identifier,
    });
  } catch (e) {
    return err('NETWORK', 'Verbindung fehlgeschlagen', e);
  }
}

/**
 * @param {string} identifier
 * @returns {Promise<import('../../shared/result.js').Result<{ exists: boolean; hasPassword: boolean }>>}
 */
export async function fetchRoomStatus(identifier) {
  try {
    const normalized = normalizeRoomIdentifier(identifier) || (identifier || '').trim();
    const id = normalized || (identifier || '').trim();
    const isCode = /^[A-Z0-9]{6,}$/i.test(id);
    const url = isCode ? `${API_BASE}/rooms/${id}` : `${API_BASE}/rooms?identifier=${encodeURIComponent(id)}`;
    const res = await fetch(url);
    const data = await res.json();
    return ok({
      exists: !!data.exists,
      hasPassword: !!data.hasPassword,
    });
  } catch (e) {
    return err('NETWORK', 'Status-Abfrage fehlgeschlagen', e);
  }
}
