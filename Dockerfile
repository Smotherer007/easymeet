# Stage 1: Build Frontend (Node 22: mediasoup >=3.19 verlangt engines.node >=22)
# Debian slim: gleiche glibc-Basis wie übliche mediasoup-Prebuilds (kein Alpine/musl).
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci

COPY . .
RUN PATH="/app/node_modules/.bin:$PATH" npm run build

# Stage 2: Production
FROM node:22-bookworm-slim

# Unter bookworm nutzt mediasoup meist den fertigen Linux-x64-Prebuild → npm ci in Minuten statt ~5+ Min Kompilat.
# Fallback (selten): Quellbuild → python3/pip + build-essential
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY config ./config

# persistent-rooms.json kommt nicht aus dem Build (.dockerignore) – Standarddatei,
# damit EASYMEET_PERSISTENT_ROOMS im Container immer eine gültige Datei findet.
# Überschreiben: Volume mounten (siehe docker-compose.yml).
RUN cp config/persistent-rooms.default.json config/persistent-rooms.json

# Defaults; echte Werte per docker compose / docker run / .env (siehe .env.example)
ENV NODE_ENV=production
ENV PORT=3001
ENV MEDIASOUP_LISTEN_IP=0.0.0.0
ENV EASYMEET_PERSISTENT_ROOMS=/app/config/persistent-rooms.json

# Keine EXPOSE: Ports werden intern (Reverse-Proxy / Overlay-Netz) angebunden, nicht am Host veröffentlicht.

CMD ["node", "server/index.js"]
