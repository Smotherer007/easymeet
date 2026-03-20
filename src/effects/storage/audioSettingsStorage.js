/**
 * Persistente Audio-/Mikro-Einstellungen (localStorage).
 */

import { AUDIO_SETTINGS_STORAGE } from '../../shared/constants.js';

export const DEFAULT_AUDIO_SETTINGS = {
  /** Sprech-Indikator: Mittelwert Frequenzpegel (ca. 5–50, höher = weniger empfindlich) */
  speakingThreshold: 15,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: false,
};

/** @type {typeof DEFAULT_AUDIO_SETTINGS | null} */
let cached = null;

function sanitizePartial(o) {
  if (!o || typeof o !== 'object') return {};
  const out = {};
  if (typeof o.speakingThreshold === 'number' && !Number.isNaN(o.speakingThreshold)) {
    out.speakingThreshold = Math.min(50, Math.max(5, Math.round(o.speakingThreshold)));
  }
  for (const k of ['noiseSuppression', 'echoCancellation', 'autoGainControl']) {
    if (typeof o[k] === 'boolean') out[k] = o[k];
  }
  return out;
}

function loadFromDisk() {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE);
    if (!raw) {
      cached = { ...DEFAULT_AUDIO_SETTINGS };
      return;
    }
    const o = JSON.parse(raw);
    cached = { ...DEFAULT_AUDIO_SETTINGS, ...sanitizePartial(o) };
  } catch {
    cached = { ...DEFAULT_AUDIO_SETTINGS };
  }
}

/** Liest aus Cache oder von der Platte (erster Aufruf). */
export function readAudioSettings() {
  if (!cached) loadFromDisk();
  return { ...cached };
}

/** Für Bootstrap: Cache füllen und Objekt zurückgeben. */
export function hydrateAudioSettingsFromStorage() {
  loadFromDisk();
  return readAudioSettings();
}

/**
 * @param {Partial<typeof DEFAULT_AUDIO_SETTINGS>} partial
 * @returns {typeof DEFAULT_AUDIO_SETTINGS}
 */
export function writeAudioSettings(partial) {
  const cur = readAudioSettings();
  const next = { ...cur };
  if (partial.speakingThreshold !== undefined) {
    const v = Number(partial.speakingThreshold);
    if (!Number.isNaN(v)) next.speakingThreshold = Math.min(50, Math.max(5, Math.round(v)));
  }
  for (const k of ['noiseSuppression', 'echoCancellation', 'autoGainControl']) {
    if (partial[k] !== undefined) next[k] = !!partial[k];
  }
  cached = next;
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE, JSON.stringify(next));
  } catch (_) {
    /* ignore */
  }
  return next;
}

export function getSpeakingThreshold() {
  return readAudioSettings().speakingThreshold;
}

/** Für getUserMedia-Audio-Constraints (ohne deviceId). */
export function getAudioProcessingConstraints() {
  const s = readAudioSettings();
  return {
    noiseSuppression: !!s.noiseSuppression,
    echoCancellation: !!s.echoCancellation,
    autoGainControl: !!s.autoGainControl,
  };
}
