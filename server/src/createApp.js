import express from "express";
import cors from "cors";
import { logHttp } from "./logger.js";
import { requestLogContextMiddleware } from "./middleware/requestLogContext.js";
import { createRoomsRouter } from "./routes/rooms.js";
import { createJoinRouter } from "./routes/join.js";
import { createGifsRouter } from "./routes/gifs.js";
import { attachStaticSpaIfPresent } from "./routes/staticSpa.js";

/**
 * @param {object} opts
 * @param {ReturnType<import('./roomStore.js').createRoomStore>} opts.roomStore
 * @param {string} opts.tenorApiKey
 * @param {string} opts.repoRoot
 */
export function createApp(opts) {
	const { roomStore, tenorApiKey, repoRoot } = opts;

	const app = express();
	app.use(cors());
	app.use(express.json());
	app.use(requestLogContextMiddleware);
	app.use((req, res, next) => {
		const start = Date.now();
		res.on("finish", () => {
			logHttp(req.method, req.originalUrl || req.url, res.statusCode, Date.now() - start, req.easymeet?.requestId);
		});
		next();
	});

	app.use("/api", createRoomsRouter({ roomStore }));
	app.use("/api", createJoinRouter({ roomStore }));
	app.use("/api", createGifsRouter({ tenorApiKey }));

	attachStaticSpaIfPresent(app, { repoRoot });

	return app;
}
