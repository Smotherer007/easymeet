import path from "path";
import fs from "fs";
import express from "express";
import { logInfo, logWarn } from "../logger.js";

/**
 * @param {import('express').Express} app
 * @param {{ repoRoot: string }} opts
 * @returns {{ distPath: string | null }}
 */
export function attachStaticSpaIfPresent(app, opts) {
	const { repoRoot } = opts;
	const distCandidates = [
		path.join(repoRoot, "client/dist"),
		path.join(repoRoot, "dist"),
		path.join(process.cwd(), "client/dist"),
		path.join(process.cwd(), "dist")
	];
	let finalDistPath = "";
	for (const p of distCandidates) {
		if (fs.existsSync(p)) {
			finalDistPath = p;
			break;
		}
	}

	if (finalDistPath) {
		logInfo("static SPA", finalDistPath);
		/* Vite emits content-hashed filenames in /assets (e.g. app-abcd1234.js).
		 * Those can be cached aggressively; index.html must stay fresh so new
		 * builds are picked up on the next navigation. */
		app.use(
			express.static(finalDistPath, {
				index: false,
				setHeaders: (res, filePath) => {
					if (/\.html$/i.test(filePath)) {
						res.setHeader("Cache-Control", "no-cache");
					} else if (/[/\\]assets[/\\]/.test(filePath)) {
						res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
					} else {
						res.setHeader("Cache-Control", "public, max-age=3600");
					}
				}
			})
		);
		app.get("/{*splat}", (req, res) => {
			res.setHeader("Cache-Control", "no-cache");
			res.sendFile(path.join(finalDistPath, "index.html"));
		});
	} else {
		logWarn("no client dist found — API + /ws only (checked client/dist, dist)");
	}

	return { distPath: finalDistPath || null };
}
