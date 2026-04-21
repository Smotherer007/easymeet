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
		app.use(express.static(finalDistPath));
		app.get("/{*splat}", (req, res) => {
			res.sendFile(path.join(finalDistPath, "index.html"));
		});
	} else {
		logWarn("no client dist found — API + /ws only (checked client/dist, dist)");
	}

	return { distPath: finalDistPath || null };
}
