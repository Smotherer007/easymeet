/**
 * Notification sounds from `public/sounds/` (Vite: root URL `/sounds/...`).
 * ICQ-style uh-oh on messages, knock on join, file-done on remote screen share.
 */

const MESSAGE_MP3 = '/sounds/single-sound-message-icq-ooh.mp3';
const JOIN_MP3 = '/sounds/the-sound-of-knocking-on-the-door.mp3';
const SCREEN_SHARE_MP3 = '/sounds/icq_file_done.mp3';

/**
 * @param {string} src
 * @param {number} [volume]
 */
function playOnce(src, volume = 0.85) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    void a.play().catch(() => {});
  } catch (_) {
    /* Autoplay-Policy oder fehlende Datei */
  }
}

/** Remote chat or file message */
export function playMessageSound() {
  playOnce(MESSAGE_MP3, 0.8);
}

/** Someone joins (chat "join" or VoIP member list grows) */
export function playJoinSound() {
  playOnce(JOIN_MP3, 0.75);
}

/** Remote participant starts screen share */
export function playScreenShareSound() {
  playOnce(SCREEN_SHARE_MP3, 0.75);
}
