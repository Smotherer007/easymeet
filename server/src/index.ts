import dotenv from "dotenv";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRoomStore } from "./roomStore.ts";
import { createApp } from "./createApp.ts";
import { createWorkers } from "./mediasoup/rooms.ts";
import { attachProtooToHttpServer } from "./mediasoup/protooSignaling.ts";
import { logInfo, logError } from "./logger.ts";
import { createAdminDb } from "./db/adminDb.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(serverRoot, ".env"), override: true });

const roomStore = createRoomStore();
setInterval(() => roomStore.cleanupExpiredRooms(), 60 * 60 * 1000).unref?.();
const adminDb = createAdminDb({ dbPath: process.env.EASYMEET_DB_PATH });
const { token: bootstrapAdminToken, created: bootstrapTokenCreated } = adminDb.getOrCreateBootstrapToken();

const giphyApiKey = process.env.GIPHY_API_KEY || "";
if (!giphyApiKey) {
	logInfo("GIPHY_API_KEY not set — GIF picker will stay empty until a key is configured in .env.");
}
const app = createApp({
	roomStore,
	adminDb,
	bootstrapAdminToken,
	giphyApiKey,
	repoRoot,
});

const PORT = process.env.PORT || 3001;

async function startServer(): Promise<void> {
	const dbRooms = adminDb.listPersistentRooms();
	for (const r of dbRooms) {
		roomStore.upsertPersistentRoomMeta(r.roomId, {
			passwordHash: r.passwordHash,
			name: r.name,
			description: r.description,
			welcomeMessage: r.welcomeMessage,
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

startServer().catch((err: unknown) => {
	logError("Server start failed", (err as Error)?.message || err);
	process.exit(1);
});
