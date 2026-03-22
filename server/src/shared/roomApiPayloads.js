/**
 * REST-API-Payload-Parsing (Create / Host / Join).
 * Spiegelbild zu client/src/shared/roomApiPayloads.js — bei Regel-Änderungen beide Dateien anpassen.
 */

/**
 * @param {unknown} body
 * @returns {{ ok: true; data: { password: string; roomCode: string } } | { ok: false; code: string; message: string }}
 */
export function parseCreateRoomBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'VALIDATION', message: 'Payload fehlt' };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const password = (typeof b.password === 'string' ? b.password : '').trim();
  const roomCode = (typeof b.roomCode === 'string' ? b.roomCode : '').trim();
  return { ok: true, data: { password, roomCode } };
}

/**
 * @param {unknown} body
 * @returns {{ ok: true; data: { hostPeerId: string } } | { ok: false; code: string; message: string }}
 */
export function parseRegisterHostBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'VALIDATION', message: 'Payload fehlt' };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const hostPeerId = typeof b.hostPeerId === 'string' ? b.hostPeerId.trim() : '';
  if (!hostPeerId) {
    return { ok: false, code: 'VALIDATION', message: 'hostPeerId erforderlich' };
  }
  return { ok: true, data: { hostPeerId } };
}

/**
 * @param {unknown} body
 * @param {string} [roomIdFromRoute]
 * @returns {{ ok: true; data: { identifier: string; password: string; peerId: string } } | { ok: false; code: string; message: string }}
 */
export function parseJoinBody(body, roomIdFromRoute = '') {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'VALIDATION', message: 'Payload fehlt' };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const identifier = String(b.identifier ?? b.roomId ?? roomIdFromRoute ?? '').trim();
  const password = (typeof b.password === 'string' ? b.password : '').trim();
  const peerId = String(b.peerId ?? '').trim();
  if (!identifier) {
    return { ok: false, code: 'VALIDATION', message: 'identifier erforderlich' };
  }
  if (!peerId) {
    return { ok: false, code: 'VALIDATION', message: 'peerId erforderlich' };
  }
  return { ok: true, data: { identifier, password, peerId } };
}
