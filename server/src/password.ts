/**
 * Password hashing via Node's built-in crypto.scrypt (memory-hard KDF).
 * Replaces bcrypt — no native addon needed.
 */

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const KEYLEN = 64; // 512-bit output
const SALT_LEN = 32; // 256-bit salt

/** Returns "saltBase64:hashBase64" */
export async function hashPassword(password: string): Promise<string> {
	if (!password) return "";
	const salt = randomBytes(SALT_LEN);
	const derived = await new Promise<Buffer>((resolve, reject) => {
		scrypt(password.trim(), salt, KEYLEN, (err, key) => {
			if (err) reject(err);
			else resolve(key);
		});
	});
	return `${salt.toString("base64")}:${derived.toString("base64")}`;
}

export async function verifyPassword(plainPassword: string, stored: string): Promise<boolean> {
	if (!stored || !plainPassword) return false;
	const idx = stored.indexOf(":");
	if (idx < 0) return false;
	const saltB64 = stored.slice(0, idx);
	const hashB64 = stored.slice(idx + 1);
	if (!saltB64 || !hashB64) return false;
	try {
		const salt = Buffer.from(saltB64, "base64");
		const expected = Buffer.from(hashB64, "base64");
		const actual = await new Promise<Buffer>((resolve, reject) => {
			scrypt(plainPassword.trim(), salt, KEYLEN, (err, key) => {
				if (err) reject(err);
				else resolve(key);
			});
		});
		return timingSafeEqual(expected, actual);
	} catch {
		return false;
	}
}
