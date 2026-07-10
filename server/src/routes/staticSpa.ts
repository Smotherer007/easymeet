import path from "node:path";
import fs from "node:fs";
import express from "express";
import { logInfo, logWarn } from "../logger.ts";

export function attachStaticSpaIfPresent(
	app: express.Express,
	opts: { repoRoot: string }
): { distPath: string | null } {
	const { repoRoot } = opts;
	const distCandidates = [
		path.join(repoRoot, "client/dist"),
		path.join(repoRoot, "dist"),
		path.join(process.cwd(), "client/dist"),
		path.join(process.cwd(), "dist"),
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
				},
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
