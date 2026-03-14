/**
 * Spielt kurze Sounds – Web Audio API, keine externen Dateien.
 * Keine Markenrechts-Probleme (ICQ etc.).
 */
function playTone(freq, duration = 0.12, gainVal = 0.12) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gainNode.gain.setValueAtTime(gainVal, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

/** Pling – new chat/file message */
export function playMessageTone() {
  playTone(1320, 0.08, 0.12);
}

/** Info tone – participant joins room (Join), short two-tone */
export function playJoinInfoTone() {
  playTone(523, 0.1, 0.1);
  setTimeout(() => playTone(659, 0.1, 0.08), 80);
}

/** Higher tone – participant joins (VOIP list) */
export function playJoinTone() {
  playTone(880, 0.12, 0.12);
}

/** Lower tone – participant leaves room */
export function playLeaveTone() {
  playTone(440, 0.15, 0.08);
}

/** Short tone – screen sharing started */
export function playStreamStartTone() {
  playTone(660, 0.1, 0.1);
}
