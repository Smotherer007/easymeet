/**
 * GIF search via the official Giphy Web SDK (@giphy/js-fetch-api).
 *
 * Key handling: the key is supplied to the server via env var GIPHY_API_KEY
 * (docker-compose env_file / .env). The server exposes it to the browser at
 * GET /api/runtime-config.json — that keeps the key out of the compiled
 * client bundle and lets operators rotate it without rebuilding the image.
 *
 * The Giphy beta key is rate-limited (100 calls/h) and designed for browser
 * use, so exposing it to the client is acceptable. For higher rate limits,
 * upgrade to a production key via the Giphy developer portal.
 */
import { GiphyFetch } from "@giphy/js-fetch-api";

/** Cache the config promise so we fetch /api/runtime-config.json at most once. */
let configPromise = null;
function fetchRuntimeConfig() {
	if (configPromise) return configPromise;
	configPromise = fetch("/api/runtime-config.json", { credentials: "same-origin" })
		.then((r) => (r.ok ? r.json() : {}))
		.catch(() => ({}));
	return configPromise;
}

/** Cache the SDK instance per resolved key so we don't recreate it on each search. */
let cachedKey = null;
let cachedGf = null;
async function getGiphyFetch() {
	const cfg = await fetchRuntimeConfig();
	const key = typeof cfg.giphyApiKey === "string" ? cfg.giphyApiKey : "";
	if (!key) return null;
	if (cachedKey !== key) {
		cachedKey = key;
		cachedGf = new GiphyFetch(key);
	}
	return cachedGf;
}

/**
 * True when the server advertises a configured Giphy key. Controls whether
 * the picker shows the "no key" hint in the UI.
 *
 * Returns a Promise because the runtime config is fetched asynchronously.
 */
export async function hasGiphyKey() {
	const cfg = await fetchRuntimeConfig();
	return typeof cfg.giphyApiKey === "string" && cfg.giphyApiKey.length > 0;
}

/**
 * Search GIFs via Giphy SDK.
 * Returns an array of { id, url, preview } where `url` is the original-quality
 * GIF (used in chat messages) and `preview` is a smaller thumbnail (used in
 * the picker grid).
 */
export async function searchGifs(query, limit = 12) {
	const q = query?.trim();
	if (!q) return [];
	const gf = await getGiphyFetch();
	if (!gf) return [];
	try {
		const { data } = await gf.search(q, { limit, type: "gifs", sort: "relevant" });
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
	} catch (err) {
		console.error("Giphy search failed:", err);
		return [];
	}
}

/**
 * Trending GIFs for initial picker content (shown before first search).
 */
export async function getTrendingGifs(limit = 12) {
	const gf = await getGiphyFetch();
	if (!gf) return [];
	try {
		const { data } = await gf.trending({ limit, type: "gifs" });
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
	} catch (err) {
		console.error("Giphy trending failed:", err);
		return [];
	}
}
