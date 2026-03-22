import { Router } from "express";
import { logError } from "../logger.js";
import { EasymeetErrorCode, jsonErrorBody } from "../easymeetErrors.js";

/**
 * @param {{ tenorApiKey: string }} deps
 */
export function createGifsRouter(deps) {
	const { tenorApiKey } = deps;
	const router = Router();

	router.get("/gifs", async (req, res) => {
		const q = (req.query?.q ?? "").trim();
		const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 12));
		if (!q) {
			res.json({ results: [] });
			return;
		}
		try {
			const tenorRes = await fetch(
				`https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${tenorApiKey}&limit=${limit}`
			);
			const data = await tenorRes.json();
			const results = (data.results || [])
				.map((g) => {
					const m = g.media?.[0] || {};
					const gif = m.gif || m.mediumgif || m.tinygif || m.nanogif;
					const url = gif?.url || "";
					const preview = m.mediumgif?.url || m.tinygif?.url || m.nanogif?.url || url;
					return { id: g.id, url, preview };
				})
				.filter((g) => g.url);
			res.json({ results });
		} catch (err) {
			logError("GET /api/gifs Tenor proxy error", err?.message || err);
			res.status(500).json({
				results: [],
				...jsonErrorBody(EasymeetErrorCode.GIFS_TENOR_ERROR, "GIF search failed")
			});
		}
	});

	return router;
}
