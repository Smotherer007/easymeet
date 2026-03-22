/**
 * Dünne Fetch-Hülle: einheitliches JSON-Parsing, Status-Handling und API-Logging.
 */

import { logApiInfo, logApiWarn, logApiDebug } from "../../utils/easymeetLog.js";

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; data: unknown }>}
 */
export async function fetchJson(url, init = {}) {
	const method = (init.method || "GET").toUpperCase();
	logApiInfo(method, url);
	try {
		const res = await fetch(url, init);
		const text = await res.text();
		let data = {};
		if (text) {
			try {
				data = JSON.parse(text);
			} catch {
				data = { _parseError: true, raw: text.slice(0, 200) };
			}
		}
		if (!res.ok) {
			const requestId = res.headers.get("x-request-id");
			logApiWarn(method, url, res.status, data, requestId ? `requestId=${requestId}` : "");
			return { ok: false, status: res.status, data, requestId: requestId || undefined };
		}
		logApiDebug("json keys", typeof data === "object" && data && !Array.isArray(data) ? Object.keys(data) : typeof data);
		logApiInfo(method, url, "→", res.status);
		return { ok: true, status: res.status, data };
	} catch (e) {
		logApiWarn(method, url, "network", e?.message || e);
		throw e;
	}
}
