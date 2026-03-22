/**
 * Canonical room ids (like HTTP /join): alphanumeric only, uppercased.
 * Avoids duplicate mediasoup rooms e.g. "abc123" vs "ABC-123".
 */
export function normalizeRoomCode(str) {
  return (str || '').trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
}
