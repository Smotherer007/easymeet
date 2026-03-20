/**
 * Diagnose für Kamera / Hintergrund-Effekte / mediasoup.
 *
 * Aktivieren (eines genügt, dann Seite neu laden):
 * - URL: `?easymeetMediaDebug=1` anhängen
 * - Konsole: `localStorage.setItem('easymeetMediaDebug', '1')`
 * - Vite-Dev (`npm run dev`): Debug ist **automatisch an**
 *
 * Logs: **`[easymeet/media-debug]`** als **warn** (sichtbar auch wenn „Info“ gefiltert ist).
 * Deaktivieren: `localStorage.removeItem('easymeetMediaDebug')` und ohne URL-Parameter laden.
 */

function urlDebugOn() {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('easymeetMediaDebug') === '1';
  } catch {
    return false;
  }
}

export function mediaDebugEnabled() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('easymeetMediaDebug') === '0') return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return true;
  } catch {
    /* ignore */
  }
  if (urlDebugOn()) return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('easymeetMediaDebug') === '1';
  } catch {
    return false;
  }
}

/**
 * @param {string} phase Kurzer Name (z. B. effect:apply:start)
 * @param {Record<string, unknown>} [data]
 */
export function mediaDebugLog(phase, data) {
  if (!mediaDebugEnabled()) return;
  const payload = data !== undefined ? data : {};
  console.warn('[easymeet/media-debug]', phase, payload);
}

/** Kurzinfos zu einer MediaStreamTrack (ohne große Objekte). */
export function mediaDebugTrackInfo(t) {
  if (!t) return null;
  return {
    id: t.id,
    kind: t.kind,
    readyState: t.readyState,
    enabled: t.enabled,
    muted: t.muted,
    label: t.label?.slice?.(0, 80),
    deviceId: t.getSettings?.()?.deviceId?.slice?.(0, 12),
  };
}

const _wiredVideoDebug = new WeakSet();

/** Einmalig `ended` / `mute` auf Video-Spuren (lokal), um schwarzes Bild ohne Effekt-Log zu erklären. */
export function mediaDebugWireStreamVideoTracks(stream, label) {
  if (!mediaDebugEnabled() || !stream?.getVideoTracks) return;
  for (const t of stream.getVideoTracks()) {
    if (!t || _wiredVideoDebug.has(t)) continue;
    _wiredVideoDebug.add(t);
    t.addEventListener('ended', () => {
      console.warn('[easymeet/media-debug]', 'video-track:ended', {
        label,
        track: mediaDebugTrackInfo(t),
      });
    });
    t.addEventListener('mute', () => {
      console.warn('[easymeet/media-debug]', 'video-track:mute', {
        label,
        track: mediaDebugTrackInfo(t),
      });
    });
  }
}

/** Video-/Audiospuren eines Streams als kompakte Liste. */
export function mediaDebugStreamInfo(stream) {
  if (!stream) return { video: [], audio: [] };
  return {
    video: (stream.getVideoTracks?.() ?? []).map(mediaDebugTrackInfo),
    audio: (stream.getAudioTracks?.() ?? []).map(mediaDebugTrackInfo),
  };
}
