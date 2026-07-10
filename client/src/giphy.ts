/**
 * GIF search via Giphy REST API (native fetch, no SDK).
 */

interface GifResult {
	id: string;
	url: string;
	preview: string;
}

let configPromise: Promise<{ giphyApiKey?: string }> | null = null;
function fetchRuntimeConfig(): Promise<{ giphyApiKey?: string }> {
	if (configPromise) return configPromise;
	configPromise = fetch("/api/runtime-config.json", { credentials: "same-origin" })
		.then((r) => (r.ok ? r.json() : {}))
		.catch(() => ({}));
	return configPromise;
}

export async function hasGiphyKey(): Promise<boolean> {
	const cfg = await fetchRuntimeConfig();
	return typeof cfg.giphyApiKey === "string" && cfg.giphyApiKey.length > 0;
}

function mapResults(data: Array<{ id: string; images?: Record<string, { url?: string }> }>): GifResult[] {
	return (data || [])
		.map((g) => {
			const img = g.images || {};
			const originalUrl = img.original?.url || img.fixed_height?.url || "";
			const previewUrl =
				img.fixed_height_small?.url ||
				img.fixed_width_small?.url ||
				img.preview_gif?.url ||
				originalUrl;
			return { id: g.id, url: originalUrl, preview: previewUrl };
		})
		.filter((g) => g.url);
}

async function giphyFetch(path: string): Promise<GifResult[]> {
	const key = (await fetchRuntimeConfig()).giphyApiKey || "";
	if (!key) return [];
	try {
		const res = await fetch(`https://api.giphy.com/v1/gifs/${path}&api_key=${encodeURIComponent(key)}`);
		if (!res.ok) return [];
		const json = (await res.json()) as { data?: Array<{ id: string; images?: Record<string, { url?: string }> }> };
		return mapResults(json.data || []);
	} catch {
		return [];
	}
}

export async function searchGifs(query: string, limit = 12): Promise<GifResult[]> {
	const q = query?.trim();
	if (!q) return [];
	return giphyFetch(`search?q=${encodeURIComponent(q)}&limit=${limit}&type=gifs&sort=relevant`);
}

export async function getTrendingGifs(limit = 12): Promise<GifResult[]> {
	return giphyFetch(`trending?limit=${limit}&type=gifs`);
}
