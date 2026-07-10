/**
 * I/O: device and user data in localStorage.
 */

import { ok, err } from "../../shared/result.js";
import { DEVICE_STORAGE, NICKNAME_STORAGE, PEER_VOLUME_STORAGE } from "../../shared/constants.js";

/**
 * @param {string} key
 * @returns {import('../../shared/result.js').Result<string|null>}
 */
export function readDeviceStorage(key) {
	try {
		const v = localStorage.getItem(key);
		return ok(v || null);
	} catch (e) {
		return err("STORAGE", "Lesen fehlgeschlagen", e);
	}
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {import('../../shared/result.js').Result<void>}
 */
export function writeDeviceStorage(key, value) {
	try {
		if (value) localStorage.setItem(key, value);
		else localStorage.removeItem(key);
		return ok(undefined);
	} catch (e) {
		return err("STORAGE", "Schreiben fehlgeschlagen", e);
	}
}

/**
 * @returns {import('../../shared/result.js').Result<{ input: string|null; output: string|null; video: string|null }>}
 */
export function readDeviceIds() {
	const input = localStorage.getItem(DEVICE_STORAGE.input) || null;
	const output = localStorage.getItem(DEVICE_STORAGE.output) || null;
	const video = localStorage.getItem(DEVICE_STORAGE.video) || null;
	return ok({ input, output, video });
}

/**
 * @param {string} key
 * @param {string|null} value
 */
export function writeDeviceId(key, value) {
	if (value) localStorage.setItem(key, value);
	else localStorage.removeItem(key);
}

/**
 * @returns {string|null}
 */
export function readNickname() {
	return localStorage.getItem(NICKNAME_STORAGE) || null;
}

/**
 * @param {string} nick
 */
export function writeNickname(nick) {
	if (nick) localStorage.setItem(NICKNAME_STORAGE, nick);
}

/**
 * @returns {Record<string, number>}
 */
export function readPeerVolumes() {
	try {
		const raw = localStorage.getItem(PEER_VOLUME_STORAGE);
		if (!raw) return {};
		const obj = JSON.parse(raw);
		return typeof obj === "object" && obj !== null ? obj : {};
	} catch {
		return {};
	}
}

/**
 * @param {Record<string, number>} volumes
 */
export function writePeerVolumes(volumes) {
	try {
		localStorage.setItem(PEER_VOLUME_STORAGE, JSON.stringify(volumes));
	} catch (_) {}
}
