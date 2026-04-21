# Stage 1: Build frontend (Node 22: mediasoup >=3.19 requires engines.node >=22)
# Debian slim: same glibc baseline as typical mediasoup prebuilds (not Alpine/musl).
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
# Linux/glibc Rollup binary for Vite: often missing with workspaces + lockfile from macOS — npm/cli#4828
RUN npm install @rollup/rollup-linux-x64-gnu@4.59.0 -w easymeet-client --no-save

COPY client ./client
RUN npm run build -w easymeet-client

# Stage 2: Production
FROM node:22-bookworm-slim

# No apt-get here: mediasoup uses the prebuilt worker on linux/amd64 (npm postinstall).
# apt under --platform linux/amd64 on Apple Silicon often fails with "invalid signature" (Buildx/QEMU);
# skipping apt avoids that. For a source build instead: build on real amd64 or use e.g. node:22-bookworm
# with python3/build-essential only in that environment.

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=builder /app/client/dist ./client/dist
COPY server ./server

# Default pinned rooms in the image (EASYMEET_PERSISTENT_ROOMS). Override via EASYMEET_PERSISTENT_ROOMS_JSON in .env
# or another EASYMEET_PERSISTENT_ROOMS path + your own file (custom image/volume).
COPY persistent-rooms.default.json /app/persistent-rooms.json
RUN chown -R node:node /app

# Defaults; override with docker compose / docker run / .env (see .env.example)
ENV NODE_ENV=production
ENV PORT=3001
ENV MEDIASOUP_LISTEN_IP=0.0.0.0
ENV EASYMEET_PERSISTENT_ROOMS=/app/persistent-rooms.json

# No EXPOSE: ports are bound internally (reverse proxy / overlay network), not published on the host by default.
# Orchestrator-sichtbarer Liveness-Check: pingt den internen HTTP-Port. /api/rooms/active ist
# rate-limited (120/min) — 2x/min Healthcheck bleibt deutlich unter der Schwelle.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/rooms/active').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server/src/index.js"]
