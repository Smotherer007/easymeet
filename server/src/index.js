import dotenv from "dotenv";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { createRoomStore } from "./roomStore.js";
import { createApp } from "./createApp.js";
import { createWorkers } from "./mediasoup/rooms.js";
import { attachProtooToHttpServer } from "./mediasoup/protooSignaling.js";
import { applyPersistentRooms } from "./persistentRooms.js";
import { logInfo, logError } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(serverRoot, ".env"), override: true });

const roomStore = createRoomStore();
setInterval(() => roomStore.cleanupExpiredRooms(), 60 * 60 * 1000);

const tenorApiKey = process.env.TENOR_API_KEY || "LIVDSRZULELA";
const app = createApp({ roomStore, tenorApiKey, repoRoot });

const PORT = process.env.PORT || 3001;

async function startServer() {
	await applyPersistentRooms(roomStore.rooms);
	await createWorkers();
	const server = http.createServer(app);
	attachProtooToHttpServer(server);
	server.listen(PORT, () => {
		logInfo(`listening http://localhost:${PORT}`, { nodeEnv: process.env.NODE_ENV || "development" });
	});
}

startServer().catch((err) => {
	logError("Server start failed", err?.message || err);
	process.exit(1);
});
