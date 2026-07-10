/**
 * Notification sounds from `public/sounds/` (Vite: root URL `/sounds/...`).
 * ICQ-style uh-oh on messages, knock on join, file-done on remote screen share.
 */

import { getAppSoundVolumeGain } from "./effects/storage/audioSettingsStorage.js";
import { DEVICE_STORAGE } from "./shared/constants.js";

const MESSAGE_MP3 = "/sounds/single-sound-message-icq-ooh.mp3";
const JOIN_MP3 = "/sounds/the-sound-of-knocking-on-the-door.mp3";
const SCREEN_SHARE_MP3 = "/sounds/icq_file_done.mp3";

/**
 * @param {string} src
 * @param {number} [volume]
 */
async function playOnce(src, volume = 0.85) {
	try {
		const a = new Audio(src);
		const masterGain = getAppSoundVolumeGain();
		a.volume = Math.min(1, Math.max(0, volume * masterGain));
		let outputDeviceId = "";
		try {
			outputDeviceId = localStorage.getItem(DEVICE_STORAGE.output) || "";
		} catch (_) {}
		if (outputDeviceId && a.setSinkId) {
			await a.setSinkId(outputDeviceId).catch(() => {});
		}
		await a.play().catch(() => {});
	} catch (_) {
		/* Autoplay policy or missing file */
	}
}

/** Remote chat or file message */
export function playMessageSound() {
	void playOnce(MESSAGE_MP3, 0.8);
}

/** Someone joins (chat "join" or VoIP member list grows) */
export function playJoinSound() {
	void playOnce(JOIN_MP3, 0.75);
}

/** Remote participant starts screen share */
export function playScreenShareSound() {
	void playOnce(SCREEN_SHARE_MP3, 0.75);
}
