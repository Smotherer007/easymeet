/**
 * Einheitliche Raum-IDs (wie HTTP /join): nur alphanumerisch, großgeschrieben.
 * Verhindert doppelte mediasoup-Räume z. B. durch "abc123" vs "ABC-123".
 */
export function normalizeRoomCode(str) {
  return (str || '').trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
}
