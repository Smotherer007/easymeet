# Stage 1: Build Frontend (Node 22: mediasoup >=3.19 verlangt engines.node >=22)
# Debian slim: gleiche glibc-Basis wie übliche mediasoup-Prebuilds (kein Alpine/musl).
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
# Linux/glibc-Binary für Rollup (Vite): fehlt oft bei Workspaces + Lockfile von macOS — npm/cli#4828
RUN npm install @rollup/rollup-linux-x64-gnu@4.59.0 -w easymeet-client --no-save

COPY client ./client
RUN npm run build -w easymeet-client

# Stage 2: Production
FROM node:22-bookworm-slim

# Kein apt-get hier: mediasoup nutzt auf linux/amd64 den fertigen Worker-Prebuild (npm postinstall).
# apt unter --platform linux/amd64 auf Apple Silicon scheitert oft mit „invalid signature“ (Buildx/QEMU) —
# ohne diesen Schritt entfällt das. Falls du doch Quellbuild brauchst: auf echtem amd64 bauen oder
# Basis z. B. node:22-bookworm + python3/build-essential nur dort einbauen.

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=builder /app/client/dist ./client/dist
COPY server ./server

# Standard-Festräume im Image (EASYMEET_PERSISTENT_ROOMS). Überschreiben: EASYMEET_PERSISTENT_ROOMS_JSON in .env
# oder anderes EASYMEET_PERSISTENT_ROOMS + eigene Datei (eigenes Image/Volume).
COPY persistent-rooms.default.json /app/persistent-rooms.json

# Defaults; echte Werte per docker compose / docker run / .env (siehe .env.example)
ENV NODE_ENV=production
ENV PORT=3001
ENV MEDIASOUP_LISTEN_IP=0.0.0.0
ENV EASYMEET_PERSISTENT_ROOMS=/app/persistent-rooms.json

# Keine EXPOSE: Ports werden intern (Reverse-Proxy / Overlay-Netz) angebunden, nicht am Host veröffentlicht.

CMD ["node", "server/src/index.js"]
