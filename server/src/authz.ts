import type { Request } from "express";

export function sanitizeClientId(raw: string): string {
	if (typeof raw !== "string") return "";
	const value = raw.trim().slice(0, 128);
	return /^[a-zA-Z0-9_-]{8,128}$/.test(value) ? value : "";
}

export function getRequestClientId(req: Request): string {
	const hdr = req.headers["x-easymeet-client-id"];
	const headerValue = Array.isArray(hdr) ? hdr[0] : hdr;
	const fromHeader = sanitizeClientId(String(headerValue || ""));
	if (fromHeader) return fromHeader;
	const q = req.query as Record<string, string | undefined>;
	return sanitizeClientId(String(q?.clientId || ""));
}
