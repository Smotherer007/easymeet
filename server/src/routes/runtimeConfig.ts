import { Router } from "express";

export function createRuntimeConfigRouter(deps: { giphyApiKey?: string }) {
	const router = Router();
	const giphyApiKey = typeof deps.giphyApiKey === "string" ? deps.giphyApiKey : "";

	router.get("/runtime-config.json", (_req, res) => {
		res.set("Cache-Control", "public, max-age=60");
		res.json({ giphyApiKey });
	});

	return router;
}
