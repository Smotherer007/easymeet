const CLIENT_ID_STORAGE_KEY = "easymeet_client_id";

function makeId() {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getClientId() {
	try {
		const existing = String(localStorage.getItem(CLIENT_ID_STORAGE_KEY) || "").trim();
		if (/^[a-f0-9]{32}$/i.test(existing)) return existing;
		const created = makeId();
		localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
		return created;
	} catch {
		return makeId();
	}
}

