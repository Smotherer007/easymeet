/**
 * GIF search via backend proxy. API key is never exposed to the client.
 * Backend uses TENOR_API_KEY env var, defaulting to Tenor demo/developer key.
 */
export function hasTenorKey() {
	return true;
}

export async function searchGifs(query, limit = 12) {
	if (!query?.trim()) return [];
	try {
		const res = await fetch(`/api/gifs?q=${encodeURIComponent(query)}&limit=${limit}`);
		const data = await res.json();
		if (!data.results || !Array.isArray(data.results)) return [];
		return data.results;
	} catch (err) {
		console.error("Tenor search failed:", err);
		return [];
	}
}
