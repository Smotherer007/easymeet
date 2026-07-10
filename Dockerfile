# Stage 1: Build frontend (Node 26 with native TypeScript support)
FROM node:26-bookworm-slim AS builder

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
FROM node:26-bookworm-slim

WORKDIR /app

# Install only server workspace deps using the root lockfile (always in sync)
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev -w easymeet-server

COPY --from=builder /app/client/dist ./client/dist
COPY server ./server
RUN chown -R node:node /app

# Defaults; override with docker compose / docker run / .env (see .env.example)
ENV NODE_ENV=production
ENV PORT=3001
ENV MEDIASOUP_LISTEN_IP=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/rooms/active').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server/src/index.ts"]
