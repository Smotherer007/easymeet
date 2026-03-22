/**
 * Short tones via Web Audio API, no external files.
 * Avoids trademark issues (ICQ etc.).
 *
 * Under HTTPS (production) AudioContext often starts "suspended" until the user interacts.
 * One context per app + resume() before playback; early unlock on first gesture (pointerdown/keydown).
 */
let sharedAudioContext = null;

export function getSharedAudioContext() {
  if (!sharedAudioContext && typeof window !== 'undefined') {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
}

/** Once: unlock context after first user interaction (autoplay policy). */
export function installAudioUnlockOnUserGesture() {
  if (typeof document === 'undefined') return;
  const unlock = () => {
    try {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    } catch (_) {}
  };
  const opts = { capture: true, passive: true };
  document.addEventListener('pointerdown', unlock, opts);
  document.addEventListener('keydown', unlock, opts);
  document.addEventListener('touchstart', unlock, opts);
}

function playTone(freq, duration = 0.12, gainVal = 0.12) {
  const run = () => {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
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
  };

  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(run).catch(() => {});
    } else {
      run();
    }
  } catch (_) {}
}

/** Pling – new chat/file message */
export function playMessageTone() {
  playTone(1320, 0.08, 0.12);
}

/** Info tone – participant joins (Join), short two-tone */
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
