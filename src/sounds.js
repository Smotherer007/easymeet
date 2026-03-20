/**
 * Benachrichtigungstöne aus `public/sounds/` (Vite: Root-URL `/sounds/...`).
 * ICQ-„Uh-oh“ bei Nachrichten, Klopfen bei Beitritt, „file done“ bei fremder Bildschirmfreigabe.
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

/** Fremde Chat- oder Datei-Nachricht */
export function playMessageSound() {
  playOnce(MESSAGE_MP3, 0.8);
}

/** Jemand tritt bei (Chat „join“ oder VoIP-Mitgliederliste wächst) */
export function playJoinSound() {
  playOnce(JOIN_MP3, 0.75);
}

/** Anderer Teilnehmer startet Bildschirmfreigabe */
export function playScreenShareSound() {
  playOnce(SCREEN_SHARE_MP3, 0.75);
}
