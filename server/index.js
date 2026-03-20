import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { validateCreateRoomPayload, validateRegisterHostPayload, validateJoinPayload } from './validate.js';
import { hashPassword, verifyPassword } from './password.js';
import { normalizeRoomCode } from './roomCode.js';
import { createWorkers, listActiveRoomsPublic, getRoom as getMediasoupRoom } from './mediasoup/rooms.js';
import { attachProtooToHttpServer } from './mediasoup/protooSignaling.js';
import { applyPersistentRooms } from './persistentRooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

const rooms = new Map();
const ROOM_TTL = 24 * 60 * 60 * 1000;

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function cleanupExpiredRooms() {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (room.persistent) continue;
    if (now - room.createdAt > ROOM_TTL) rooms.delete(id);
  }
}
setInterval(cleanupExpiredRooms, 60 * 60 * 1000);

app.post('/api/rooms', async (req, res) => {
  const parsed = validateCreateRoomPayload(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error);
    return;
  }
  const { password, roomCode } = parsed.data;
  const passwordHash = password ? await hashPassword(password) : null;
  let roomId = (roomCode && normalizeRoomCode(roomCode)) || null;
  if (!roomId || rooms.has(roomId)) {
    roomId = generateRoomId();
    while (rooms.has(roomId)) roomId = generateRoomId();
  }
  rooms.set(roomId, {
    passwordHash,
    hostPeerId: null,
    createdAt: Date.now(),
  });
  res.json({ roomId, hostPeerId: null });
});

app.patch('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const parsed = validateRegisterHostPayload(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error);
    return;
  }
  const room = rooms.get(roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  room.hostPeerId = parsed.data.hostPeerId;
  res.json({ ok: true });
});

function findRoomByIdentifier(identifier) {
  const id = (identifier || '').trim();
  if (!id) return null;
  const code = normalizeRoomCode(id);
  if (!code) return null;
  const room = rooms.get(code);
  return room ? { roomId: code, room } : null;
}

async function handleJoin(req, res) {
  const parsed = validateJoinPayload(req.body, req.params?.roomId);
  if (!parsed.success) {
    res.status(400).json(parsed.error);
    return;
  }
  const { identifier, password: providedPassword, peerId } = parsed.data;
  const found = findRoomByIdentifier(identifier);
  if (!found) return res.status(404).json({ error: 'Room not found' });
  const { roomId: actualRoomId, room } = found;
  const hasPassword = room.passwordHash != null && room.passwordHash !== '';
  if (hasPassword) {
    const valid = await verifyPassword(providedPassword, room.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ roomId: actualRoomId });
}

app.post('/api/join', async (req, res) => {
  try {
    await handleJoin(req, res);
  } catch (err) {
    console.error('Join error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/rooms', (req, res) => {
  const identifier = req.query?.identifier ?? '';
  const found = findRoomByIdentifier(identifier);
  const room = found?.room;
  res.json({
    exists: !!room,
    hasPassword: room ? (room.passwordHash != null && room.passwordHash !== '') : false,
  });
});

/** Muss vor /api/rooms/:roomId stehen, sonst wird „active“ als Raum-ID interpretiert. */
app.get('/api/rooms/active', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  cleanupExpiredRooms();
  const fromMs = listActiveRoomsPublic();
  const byId = new Map(fromMs.map((r) => [r.roomId, r]));
  /* Fallback: alle HTTP-Räume prüfen (nach Normalisierung doppelt zu fromMs, sonst ergänzend) */
  for (const httpId of rooms.keys()) {
    const ms = getMediasoupRoom(httpId);
    const n = ms?.peers?.size ?? 0;
    if (n < 1) continue;
    if (!byId.has(httpId)) byId.set(httpId, { roomId: httpId, participantCount: n });
  }
  const payload = [...byId.values()]
    .sort((a, b) => a.roomId.localeCompare(b.roomId))
    .map(({ roomId, participantCount }) => {
      const meta = rooms.get(roomId);
      const hasPassword = meta ? meta.passwordHash != null && meta.passwordHash !== '' : false;
      return { roomId, participantCount, hasPassword };
    });
  res.json({ rooms: payload });
});

/** Feste Räume (JSON-Pfad EASYMEET_PERSISTENT_ROOMS – ohne VoIP, immer sichtbar für Join). */
app.get('/api/rooms/pinned', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const list = [];
  for (const [roomId, room] of rooms.entries()) {
    if (!room.persistent) continue;
    list.push({
      roomId,
      hasPassword: room.passwordHash != null && room.passwordHash !== '',
    });
  }
  list.sort((a, b) => a.roomId.localeCompare(b.roomId));
  res.json({ rooms: list });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const identifier = req.query?.identifier ?? req.params.roomId;
  const found = findRoomByIdentifier(identifier);
  const room = found?.room;
  res.json({
    exists: !!room,
    hasPassword: room ? (room.passwordHash != null && room.passwordHash !== '') : false,
  });
});

const TENOR_API_KEY = process.env.TENOR_API_KEY || 'LIVDSRZULELA';

app.get('/api/gifs', async (req, res) => {
  const q = (req.query?.q ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 12));
  if (!q) {
    res.json({ results: [] });
    return;
  }
  try {
    const tenorRes = await fetch(
      `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&limit=${limit}`
    );
    const data = await tenorRes.json();
    const results = (data.results || []).map((g) => {
      const m = g.media?.[0] || {};
      const gif = m.gif || m.mediumgif || m.tinygif || m.nanogif;
      const url = gif?.url || '';
      const preview = m.mediumgif?.url || m.tinygif?.url || m.nanogif?.url || url;
      return { id: g.id, url, preview };
    }).filter((g) => g.url);
    res.json({ results });
  } catch (err) {
    console.error('Tenor proxy error:', err);
    res.status(500).json({ results: [] });
  }
});

const distPath = path.join(__dirname, '../dist');
const finalDistPath = fs.existsSync(distPath) ? distPath : path.join(process.cwd(), 'dist');

if (fs.existsSync(finalDistPath)) {
  app.use(express.static(finalDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(finalDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;

async function startServer() {
  await applyPersistentRooms(rooms);
  await createWorkers();
  const server = http.createServer(app);
  attachProtooToHttpServer(server);
  server.listen(PORT, () => {
    console.log(`EasyMeet API + mediasoup running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server start failed:', err);
  process.exit(1);
});
