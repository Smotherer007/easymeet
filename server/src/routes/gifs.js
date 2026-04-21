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
			/* Tenor v2 (googleapis.com). v1 (g.tenor.com) ist seit 2023 deprecated.
			 * client_key ist optional, aber von Google empfohlen zur API-Identifikation. */
			const params = new URLSearchParams({
				q,
				key: tenorApiKey || "",
				client_key: "easymeet",
				limit: String(limit),
				media_filter: "gif,tinygif,mediumgif,nanogif"
			});
			const tenorRes = await fetch(`https://tenor.googleapis.com/v2/search?${params.toString()}`);
			const data = await tenorRes.json();
			const results = (data.results || [])
				.map((g) => {
					/* v2: media_formats statt media[0]; selbe Keys innerhalb (url, dims, size). */
					const mf = g.media_formats || {};
					const gif = mf.gif || mf.mediumgif || mf.tinygif || mf.nanogif;
					const url = gif?.url || "";
					const preview = mf.mediumgif?.url || mf.tinygif?.url || mf.nanogif?.url || url;
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
