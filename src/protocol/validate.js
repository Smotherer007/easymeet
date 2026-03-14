/**
 * Validation of peer messages.
 * Pure functions – no side effects.
 */

import { ok, err } from '../shared/result.js';

/**
 * Checks whether data is a valid object with a type field.
 * @param {unknown} data
 * @returns {data is object & { type: string }}
 */
function isTypedObject(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data) && !(data instanceof ArrayBuffer);
}

/**
 * Validiert join-Nachricht.
 * @param {unknown} data
 * @returns {import('../shared/result.js').Result<{ type: 'join'; nick: string }>}
 */
export function validateJoinMessage(data) {
  if (!isTypedObject(data) || data.type !== 'join') {
    return err('VALIDATION', 'Not a join message');
  }
  const nick = String((data).nick ?? '').trim();
  if (!nick) return err('VALIDATION', 'nick required');
  return ok({ type: 'join', nick });
}

/**
 * Validates chat message.
 * @param {unknown} data
 * @returns {import('../shared/result.js').Result<{ type: 'chat'; nick: string; text: string; ts: number; giphyUrls: string[] }>}
 */
export function validateChatMessage(data) {
  if (!isTypedObject(data) || data.type !== 'chat') {
    return err('VALIDATION', 'Not a chat message');
  }
  const nick = String((data).nick ?? '').trim();
  const text = String((data).text ?? '');
  const ts = Number((data).ts) || Date.now();
  const urls = Array.isArray((data).giphyUrls) ? (data).giphyUrls : ((data).giphyUrl ? [(data).giphyUrl] : []);
  return ok({ type: 'chat', nick, text, ts, giphyUrls: urls });
}

/**
 * Validates mute message.
 * @param {unknown} data
 * @returns {import('../shared/result.js').Result<{ type: 'mute'; peerId: string; muted: boolean }>}
 */
export function validateMuteMessage(data) {
  if (!isTypedObject(data) || data.type !== 'mute') {
    return err('VALIDATION', 'Not a mute message');
  }
  const peerId = String((data).peerId ?? '');
  const muted = Boolean((data).muted);
  return ok({ type: 'mute', peerId, muted });
}

/**
 * Parses peer event to validated message.
 * Returns null when not an app message (e.g. binary). * @param {unknown} data
 * @returns {import('../shared/result.js').Result<import('./messages.js').PeerMessage> | null}
 */
export function parsePeerEvent(data) {
  if (!isTypedObject(data)) return null;
  const d = /** @type {Record<string, unknown>} */ (data);
  switch (d.type) {
    case 'join':
      return validateJoinMessage(d);
    case 'leave':
      return ok({ type: 'leave', nick: String(d.nick ?? '?'), peerId: d.peerId ? String(d.peerId) : undefined });
    case 'chat': {
      const r = validateChatMessage(d);
      return r.success ? ok({ ...r.data, type: 'chat' }) : r;
    }
    case 'file_share':
      return ok({
        type: 'file_share',
        nick: String(d.nick ?? '?'),
        filename: String(d.filename ?? ''),
        ts: Number(d.ts) || Date.now(),
        fileId: d.fileId ? String(d.fileId) : undefined,
      });
    case 'members':
      return ok({ type: 'members', list: Array.isArray(d.list) ? d.list.map(String) : [] });
    case 'peers':
      return ok({
        type: 'peers',
        list: Array.isArray(d.list) ? d.list.map(String) : [],
        members: Array.isArray(d.members) ? d.members.map((m) => ({ peerId: String(m?.peerId ?? ''), nick: String(m?.nick ?? '?') })) : undefined,
      });
    case 'new_peer':
      return ok({ type: 'new_peer', peerId: String(d.peerId ?? ''), nick: String(d.nick ?? '?') });
    case 'mute':
      return validateMuteMessage(d);
    case 'screen_sharing':
      return ok({ type: 'screen_sharing', peerId: String(d.peerId ?? ''), nick: String(d.nick ?? '?') });
    case 'screen_sharing_stopped':
      return ok({ type: 'screen_sharing_stopped', peerId: String(d.peerId ?? '') });
    case 'screen_stream':
      return ok({ type: 'screen_stream', peerId: String(d.peerId ?? ''), nick: d.nick ? String(d.nick) : undefined });
    case 'host_leaving':
      return ok({ type: 'host_leaving' });
    default:
      return null;
  }
}
