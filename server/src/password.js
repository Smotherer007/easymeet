/**
 * Password hashing – server never stores plaintext passwords.
 * Pure functions for hash/verify, I/O only in callers.
 */

import bcrypt from "bcrypt";

/**
 * bcrypt cost factor. 12 ≈ ~250 ms/hash on modern CPUs — comfortable
 * margin against offline brute force in 2026 without hurting UX
 * (hash/verify only runs during create-room / join).
 */
const SALT_ROUNDS = 12;

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
	if (!password || typeof password !== "string") return "";
	return bcrypt.hash(password.trim(), SALT_ROUNDS);
}

/**
 * @param {string} plainPassword
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plainPassword, hash) {
	if (!hash || plainPassword === undefined) return false;
	if (typeof plainPassword !== "string") return false;
	return bcrypt.compare(plainPassword.trim(), hash);
}
