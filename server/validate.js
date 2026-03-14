/**
 * Server-seitige Validierung – Plain Functions, Result-Typ.
 * Domain-Logik ausgelagert aus den Express-Handlern.
 */

/**
 * @param {unknown} body
 * @returns {{ success: true; data: { password: string; roomCode: string } } | { success: false; error: { code: string; message: string } }}
 */
export function validateCreateRoomPayload(body) {
  if (!body || typeof body !== 'object') {
    return { success: false, error: { code: 'VALIDATION', message: 'Payload fehlt' } };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const password = (typeof b.password === 'string' ? b.password : '').trim();
  const roomCode = (typeof b.roomCode === 'string' ? b.roomCode : '').trim();
  return { success: true, data: { password, roomCode } };
}

/**
 * @param {unknown} body
 * @returns {{ success: true; data: { hostPeerId: string } } | { success: false; error: { code: string; message: string } }}
 */
export function validateRegisterHostPayload(body) {
  if (!body || typeof body !== 'object') {
    return { success: false, error: { code: 'VALIDATION', message: 'Payload fehlt' } };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const hostPeerId = typeof b.hostPeerId === 'string' ? b.hostPeerId.trim() : '';
  if (!hostPeerId) {
    return { success: false, error: { code: 'VALIDATION', message: 'hostPeerId erforderlich' } };
  }
  return { success: true, data: { hostPeerId } };
}

/**
 * @param {unknown} body
 * @param {string} [roomIdParam]
 * @returns {{ success: true; data: { identifier: string; password: string; peerId: string } } | { success: false; error: { code: string; message: string } }}
 */
export function validateJoinPayload(body, roomIdParam = '') {
  if (!body || typeof body !== 'object') {
    return { success: false, error: { code: 'VALIDATION', message: 'Payload fehlt' } };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const identifier = String(b.identifier ?? b.roomId ?? roomIdParam ?? '').trim();
  const password = (typeof b.password === 'string' ? b.password : '').trim();
  const peerId = String(b.peerId ?? '').trim();
  if (!identifier) {
    return { success: false, error: { code: 'VALIDATION', message: 'identifier erforderlich' } };
  }
  if (!peerId) {
    return { success: false, error: { code: 'VALIDATION', message: 'peerId erforderlich' } };
  }
  return { success: true, data: { identifier, password, peerId } };
}
