/**
 * Sound notifications – synthetic tones via Web Audio API.
 * No external files, no trademark issues (ICQ etc.).
 */
import { playMessageTone, playJoinInfoTone } from './audio.js';

export function playMessageSound() {
  playMessageTone();
}

export function playJoinSound() {
  playJoinInfoTone();
}
