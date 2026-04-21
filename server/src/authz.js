export function sanitizeClientId(raw) {
	if (typeof raw !== "string") return "";
	const value = raw.trim().slice(0, 128);
	return /^[a-zA-Z0-9_-]{8,128}$/.test(value) ? value : "";
}

export function getRequestClientId(req) {
	const hdr = req.headers["x-easymeet-client-id"];
	const headerValue = Array.isArray(hdr) ? hdr[0] : hdr;
	const fromHeader = sanitizeClientId(String(headerValue || ""));
	if (fromHeader) return fromHeader;
	return sanitizeClientId(String(req.query?.clientId || ""));
}


