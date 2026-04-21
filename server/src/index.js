import dotenv from "dotenv";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { createRoomStore } from "./roomStore.js";
import { createApp } from "./createApp.js";
import { createWorkers } from "./mediasoup/rooms.js";
import { attachProtooToHttpServer } from "./mediasoup/protooSignaling.js";
import { logInfo, logError } from "./logger.js";
import { createAdminDb } from "./db/adminDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(serverRoot, ".env"), override: true });

const roomStore = createRoomStore();
/* .unref() lets the process exit cleanly during tests / SIGINT — the timer
 * itself never holds the event loop open. */
setInterval(() => roomStore.cleanupExpiredRooms(), 60 * 60 * 1000).unref?.();
const adminDb = createAdminDb({ dbPath: process.env.EASYMEET_DB_PATH });
const { token: bootstrapAdminToken, created: bootstrapTokenCreated } = adminDb.getOrCreateBootstrapToken();

const tenorApiKey = process.env.TENOR_API_KEY || "";
if (!tenorApiKey) {
	logInfo("TENOR_API_KEY not set — GIF search will fall back to Tenor demo key (rate-limited, public).");
}
const app = createApp({
	roomStore,
	adminDb,
	bootstrapAdminToken,
	tenorApiKey,
	repoRoot
});

const PORT = process.env.PORT || 3001;

async function startServer() {
	const dbRooms = adminDb.listPersistentRooms();
	for (const r of dbRooms) {
		roomStore.upsertPersistentRoomMeta(r.roomId, {
			passwordHash: r.passwordHash,
			name: r.name,
			description: r.description,
			welcomeMessage: r.welcomeMessage
		});
	}
	await createWorkers();
	const server = http.createServer(app);
	attachProtooToHttpServer(server, { adminDb, roomStore });
	server.listen(PORT, () => {
		logInfo(`listening http://localhost:${PORT}`, { nodeEnv: process.env.NODE_ENV || "development" });
		const marker = "######";
		logInfo(marker.repeat(14));
		logInfo(`${marker} SERVER ADMIN BOOTSTRAP TOKEN ${bootstrapTokenCreated ? "(NEW)" : "(EXISTING)"} ${marker}`);
		logInfo(`${marker} ${bootstrapAdminToken} ${marker}`);
		logInfo(marker.repeat(14));
	});
}

startServer().catch((err) => {
	logError("Server start failed", err?.message || err);
	process.exit(1);
});
