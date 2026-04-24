# EasyMeet

**Browser video conferencing (mediasoup SFU)** – Chat, file sharing, screen sharing, and virtual backgrounds. No installation, no app – everything runs directly in the web browser; media and signaling go through your **EasyMeet server**.

[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)
[![mediasoup](https://img.shields.io/badge/mediasoup-SFU-orange.svg)](https://mediasoup.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

---

## Table of Contents

- [Features](#features)
- [Screenshots & Demo](#screenshots--demo)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Docker](#docker)
- [Documentation](#documentation)
- [License](#license)

---

## Features

| Feature                 | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| **Video Conferencing**  | Audio/video via **mediasoup** SFU running on the server                             |
| **Audio & Video**       | Microphone, camera, mute, video on/off                                              |
| **Device Switching**    | Switch microphone and camera during calls (exact constraint for reliable selection) |
| **Screen Sharing**      | `getDisplayMedia` with optional system audio                                        |
| **Chat**                | Text messages, emojis, GIFs (Giphy)                                                 |
| **File Sharing**        | Files sent as chunks via Protoo to all room participants; folders are zipped        |
| **Virtual Backgrounds** | Blur, preset images (e.g. The Office, Matrix), custom uploads                       |
| **Speaking Indicator**  | Visual display of speaking activity                                                 |
| **Voice Rooms**         | Audio-only mode for voice-only conferences                                          |
| **Room Management**     | Password protection, optional room code, join via code or URL                      |
| **Video Layout**        | Grid and free mode (draggable windows)                                              |
| **Volume Slider**       | Per-participant volume control in video tiles and participant list                  |
| **i18n**                | German and English                                                                  |

---

## Screenshots & Demo

**[→ Live Demo](https://easymeet.easyroomtools.tech/)**

_Landing page → Create/join room → Room view with video, chat, participant list_

The app provides a clear interface with:

- **Landing:** Quick access to "Create room" and "Join room"
- **Create Room:** Password, optional room code, QR code for mobile participation
- **Join Room:** Room code input, password if required
- **Room View:** Video grid, chat, participant list, settings, screen sharing

---

## Tech Stack

| Area                    | Technology                                                  |
| ----------------------- | ----------------------------------------------------------- |
| **Frontend**            | Vite 8, Vanilla JS (ES Modules), CSS                        |
| **Backend**             | Node.js, Express                                            |
| **Realtime**            | mediasoup (SFU), Protoo WebSocket, WebRTC                   |
| **UI**                  | Lucide Icons                                                |
| **Virtual Backgrounds** | MediaPipe Tasks Vision, Selfie Segmentation                 |
| **Other**               | bcrypt, qrcode, fflate, protoo-client                       |
| **Deployment**          | Docker, docker-compose                                      |

---

## Quick Start

### Prerequisites

- **Node.js** 22 or higher (required by current mediasoup versions)
- **npm**

### Installation

```bash
git clone https://github.com/Smotherer007/easymeet.git
cd easymeet
npm install
```

The postinstall script automatically downloads MediaPipe models for virtual backgrounds.

Optional environment variables: see [.env.example](.env.example) (e.g. `GIPHY_API_KEY` for GIF search).

### Development

```bash
# Frontend (Vite) – http://localhost:5173
npm run dev

# Backend (Express) – http://localhost:3001
npm run server

# Both in parallel
npm run dev:all
```

> **Note:** Running only `npm run dev` does **not** start the backend. Calls like `/api/join` will fail with `ECONNREFUSED`. Always use **`npm run dev:all`** or start the server in a separate terminal with **`npm run server`**. The proxy target is configured via `VITE_PROXY_API_TARGET` in **`.env`** at the repo root (default: `http://localhost:3001`).

**Local configuration:** Copy the environment file with **`cp .env.example .env`**. Vite and the server both read the same **`.env`** at the repo root. Optionally, **`server/.env`** can override individual variables.

**Troubleshooting:**

- **`npm install` fails on mediasoup** (`SSL: CERTIFICATE_VERIFY_FAILED` when downloading libuv): mediasoup first tries to download a prebuilt binary from GitHub; if that fails it builds locally using Python. Python installed from python.org on macOS often lacks root certificates.
    1. **Recommended:** Open **Finder → Applications → Python 3.x** and run the **`Install Certificates.command`** script.
    2. **Alternative:** Use Homebrew Python which ships with correct CAs: `brew install python@3.12`, then run **`PYTHON=/opt/homebrew/bin/python3.12 npm install`**.
    3. Afterwards: **`rm -rf node_modules/mediasoup`** and run **`npm install`** again from the repo root, or use **`npm run rebuild:mediasoup`**.
- **`mediasoup-worker` ENOENT** (server starts but no binary found): same root cause — the worker was never fully built. Follow the steps above, then run **`npm install`** or **`npm run rebuild:mediasoup`**.

### Production Build

```bash
npm run build
npm run preview # Preview the build locally
```

**URLs:**

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001` (proxied under `/api` in dev)

**Media / Protoo:** In Vite dev mode (`:5173`), the client connects **directly** to `ws(s)://<host>:3001/ws` (subprotocol `protoo` — the Vite WS proxy is not suitable for this). Logs appear under **`[easymeet/ms]`**. Port is controlled by `VITE_MEDIASOUP_PROTOO_PORT`.

**Production / Reverse Proxy:** Protoo uses **`wss://<your-domain>/ws`** (same origin as the page, no `:3001` in the URL). The reverse proxy must forward WebSocket upgrade requests for the `/ws` path to the Node backend (e.g. `http://easymeet:3001`). Without a reverse proxy, set **`VITE_MEDIASOUP_PROTOO_DIRECT=true`** in **`.env`** at build time.

---

## Project Structure

**Monorepo (npm workspaces):** The root `package.json` orchestrates **`client/`** (Vite frontend) and **`server/`** (Express + mediasoup). The REST payload schemas for create/join are duplicated in `client/src/shared/roomApiPayloads.js` and `server/src/shared/roomApiPayloads.js` — keep both in sync when making changes.

```
easymeet/
├── package.json            # Workspaces, scripts (dev, dev:all, build, …)
├── client/                 # Vite SPA
│   ├── package.json
│   ├── vite.config.js      # Dev proxy for /api and /ws
│   ├── index.html
│   ├── public/             # Favicon, sounds, …
│   └── src/
│       ├── main.js
│       ├── app/            # Bootstrap, composition root
│       ├── domain/
│       ├── store/
│       ├── effects/
│       ├── protocol/
│       ├── shared/         # Result helper, constants, roomApiPayloads
│       ├── ui/screens/
│       └── utils/
├── server/                 # Express + mediasoup + Protoo
│   ├── package.json
│   ├── .env.example        # Optional server-side overrides
│   └── src/
│       ├── index.js
│       ├── logger.js
│       ├── validate.js
│       ├── mediasoup/
│       ├── shared/         # roomApiPayloads (duplicate of client)
│       └── …
├── .env.example            # Template → copy to .env (gitignored)
├── Dockerfile
├── docker-compose.yml
└── CONTRIBUTING.md
```

**Logging:** Server log level is controlled by `EASYMEET_LOG_LEVEL` (`silent` \| `error` \| `warn` \| `info` \| `debug`, default `info`). Client log level is controlled by `VITE_LOG_LEVEL` in **`.env`** at the repo root (same levels). Console prefixes: `easymeet/server`, `easymeet/protoo`, `easymeet/mediasoup`, `easymeet/api`, `easymeet/ms`, `easymeet/app`.

---

## Architecture

### Flow

1. **Host** creates a room (optional password)
2. **Server** registers the room and starts a **mediasoup Router** per room
3. **Participants** join via code or URL; **WebRTC** runs client ↔ server (SFU), not pure P2P
4. **Chat and files** are delivered via Protoo notifications (`easymeet.*`); media is handled via **Producer/Consumer** and server-driven **`newConsumer`** events (standard mediasoup/Protoo pattern)

### Four-Layer Model

- **Layer 4 (I/O):** mediasoup-client + protoo-client, DOM, fetch, localStorage
- **Layer 3 (Domain):** Reducer, Events, Invariants
- **Layer 2 (Utilities):** Result helper, Protocol, Selectors
- **Layer 1 (Primitives):** map, filter, reduce

### Principles

- **Plain Data** – No domain classes, only objects and arrays
- **Pure Functions** – No side effects in domain logic
- **Result&lt;T&gt;** – Expected errors via `ok`/`err`
- **Single Source of Truth** – Store as the only source of truth
- **Isolated Effects** – I/O only in `effects/`

---

## API Reference

| Method   | Path                              | Description                                                          |
| -------- | --------------------------------- | -------------------------------------------------------------------- |
| `POST`   | `/api/rooms`                      | Create a new room (optional `password`, `roomCode`)                  |
| `GET`    | `/api/rooms`                      | Check room existence (`?identifier=…`)                               |
| `GET`    | `/api/rooms/active`               | List active rooms with participant counts (rate-limited)             |
| `GET`    | `/api/rooms/pinned`               | List persistent/pinned rooms                                         |
| `GET`    | `/api/rooms/:roomId`              | Check single room status                                             |
| `PATCH`  | `/api/rooms/:roomId`              | Register host PeerId (requires `hostSetupToken`)                     |
| `POST`   | `/api/join`                       | Join a room (returns server `peerId` + one-time `wsToken` for `/ws`) |
| `POST`   | `/api/admin/bootstrap-login`      | Authenticate with bootstrap token (rate-limited, 5/min)             |
| `GET`    | `/api/admin/me`                   | Get current admin status                                             |
| `POST`   | `/api/admin/persistent-rooms`     | Create a persistent room (admin only)                                |
| `DELETE` | `/api/admin/persistent-rooms/:id` | Delete a persistent room (admin only)                                |
| `GET`    | `/api/runtime-config.json`        | Returns runtime config (e.g. `giphyApiKey`); cached 60 s            |

**Example – Create room:**

```bash
curl -X POST http://localhost:3001/api/rooms \
	-H "Content-Type: application/json" \
	-d '{"password": "optional", "roomCode": "ABC123"}'
```

**Response:** `{ "roomId": "ABC123", "hostPeerId": null }`

**Join (then WebSocket):** `POST /api/join` with JSON `{ "identifier": "ABC123", "password": "" }` returns `{ "roomId", "peerId", "wsToken" }`. The client then opens **`/ws?roomId=…&peerId=…&token=…&clientId=…`** with those values. Room creators call the same join route after `POST /api/rooms` to obtain their `peerId` and `wsToken`.

### Join / WS Token Flow

- `wsToken` is issued exclusively by `POST /api/join` and is bound to `roomId`, `peerId`, and `clientId`.
- The token is **one-time use** and expires after approximately 10 minutes.
- `/ws` only accepts unused, valid tokens and rejects reuse, expiry, and mismatches.
- On `WS_TOKEN_INVALID` or `WS_URL_TOKEN_MISMATCH`: call `POST /api/join` again and reconnect with the new `peerId` and `wsToken`.

---

## Docker

### Overview

The application uses a **multi-stage Docker build**:

1. **Stage 1 (builder):** Builds the frontend with Vite, outputs `dist/`
2. **Stage 2 (production):** Node.js (bookworm-slim) image serving static files and the Express API from a single process

In production, the Express server serves both the API (`/api/*`) and the static frontend (`dist/`) on a single port.

### Build & Push

```bash
# Build image (linux/amd64)
npm run docker:build

# Push to registry
npm run docker:push

# Build and push in one step
npm run docker:build:and:push
```

**Image:** `smotherer/easymeet:latest`

### GitHub Actions (CI/CD)

On every push to `main`, a GitHub Action automatically builds and pushes the Docker image to Docker Hub.

**Setup:** Go to GitHub Repository Settings → Secrets and variables → Actions and add two secrets:

| Secret               | Description                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `DOCKERHUB_USERNAME` | Your Docker Hub username (e.g. `smotherer`)                                                        |
| `DOCKERHUB_TOKEN`    | Access token from [Docker Hub → Account Settings → Security](https://hub.docker.com/settings/security) |

The pipeline can also be triggered manually under **Actions → Build and Push Docker Image → Run workflow**.

### Environment Variables

**Server:**

| Variable                                  | Default                     | Description                                                                                                                                                                                      |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                                    | `3001`                      | Port the server listens on                                                                                                                                                                       |
| `NODE_ENV`                                | `production`                | Set automatically in Dockerfile                                                                                                                                                                  |
| `MEDIASOUP_ANNOUNCED_IP`                  | _(empty)_                   | **Required in Docker/Cloud:** public IP or hostname for ICE (otherwise video/audio often fails). See [mediasoup docs](https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions) |
| `MEDIASOUP_LISTEN_IP`                     | `0.0.0.0`                   | Bind address for the WebRTC transport                                                                                                                                                            |
| `RTC_MIN_PORT` / `RTC_MAX_PORT`           | `40000` / `40200`           | UDP port range for RTP (must be forwarded to the container)                                                                                                                                      |
| `EASYMEET_DB_PATH`                        | `/app/data/easymeet.sqlite` | SQLite file path for server-admin and persistent-room metadata                                                                                                                                   |
| `EASYMEET_LOG_LEVEL`                      | `info`                      | `silent` \| `error` \| `warn` \| `info` \| `debug`                                                                                                                                              |
| `EASYMEET_CORS_ORIGINS`                   | _(empty)_                   | Comma-separated list of allowed origins (e.g. `https://meet.example.com`)                                                                                                                        |
| `EASYMEET_API_RATE_LIMIT_MAX`             | `120`                       | Max requests per minute for `/api/*`                                                                                                                                                             |
| `EASYMEET_JOIN_RATE_LIMIT_MAX`            | `30`                        | Max requests per minute for `/api/join`                                                                                                                                                          |
| `EASYMEET_BOOTSTRAP_LOGIN_RATE_LIMIT_MAX` | `5`                         | Max requests per minute for `/api/admin/bootstrap-login`                                                                                                                                         |
| `EASYMEET_WS_CHAT_PER_10S`               | `20`                        | Max chat messages per peer per 10 seconds (WebSocket)                                                                                                                                            |
| `EASYMEET_WS_FILE_CHUNKS_PER_10S`        | `160`                       | Max file chunks per peer per 10 seconds (WebSocket)                                                                                                                                              |
| `GIPHY_API_KEY`                           | _(empty)_                   | Optional API key for GIF search (served at runtime via `/api/runtime-config.json`, no image rebuild needed)                                                                                       |

**Client (Vite, build-time – no secrets):**

| Variable                        | Default                   | Description                                                         |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `VITE_LOG_LEVEL`                | `info`                    | `silent` \| `error` \| `warn` \| `info` \| `debug`                 |
| `VITE_PROXY_API_TARGET`         | `http://localhost:3001`   | Dev-server proxy target for `/api` and `/ws`                        |
| `VITE_MEDIASOUP_PROTOO_DIRECT`  | `false`                   | Set `true` to connect Protoo directly (without reverse-proxy `/ws`) |
| `VITE_MEDIASOUP_PROTOO_PORT`    | `3001`                    | Port used for direct Protoo connection                              |

**Docker / Compose:** Load variables via **`env_file: ./.env`**. Persistent rooms and server-admin data are stored in SQLite at `EASYMEET_DB_PATH`. Fixed values can also be set directly under `services.app.environment:` in the Compose file (these override `env_file`).

**Container does not start / port 40000 in use:** The repo's `docker-compose.yml` has no `ports:` entries. Port mappings typically come from a **`docker-compose.override.yml`** (merged automatically). Inspect the effective config with `docker compose config`.

**Nginx / WebSocket:** The reverse proxy must forward WebSocket upgrade requests for the `/ws` path to the backend at port 3001.

### Running with Docker

```bash
docker run -p 3001:3001 -p 40000-40200:40000-40200/udp \
	--env-file ./.env \
	smotherer/easymeet:latest
```

### docker-compose

The `docker-compose.yml` expects an external network named **`frontend`**. Default setup uses only **`./.env`**.

```bash
cp .env.example .env
docker network create frontend
docker compose up -d
# or: npm run docker:up
```

The Compose file does **not** publish any `ports:` — the service is only reachable within the `frontend` network (intended for use behind a reverse proxy). **UDP 40000–40200** must be forwarded to the container for WebRTC to work.

To run locally with exposed ports, add them manually to the Compose file, e.g. `"3001:3001"` and `"40000-40200:40000-40200/udp"`.

### Dockerfile Details

| Stage        | Base Image              | Purpose                                                                         |
| ------------ | ----------------------- | ------------------------------------------------------------------------------- |
| `builder`    | `node:22-bookworm-slim` | Runs `npm ci` across workspaces, then `npm run build` → `client/dist/`          |
| `production` | `node:22-bookworm-slim` | mediasoup prebuild (glibc); fallback build requires `python3`, `build-essential` |

The production image:

- No config baked in — all configuration is injected at runtime via `env_file` or `docker run --env-file`
- Serves static files from `client/dist/`
- Handles API routes under `/api`
- Falls back to `index.html` for SPA routing
- No `EXPOSE` directive; listens internally on `PORT` (default `3001`)

---

## Pi EasyMeet Bridge

A lightweight pi extension is included under `pi-easymeet-bridge/` to bridge EasyMeet chat with a running pi session.

1. **Install deps once**
   ```bash
   cd pi-easymeet-bridge
   npm install
   ```
2. **Register the extension** – add this path to `~/.pi/agent/settings.json`:
   ```json
   {
     "extensions": [
       "/Users/patrickweppelmann/Documents/Workspace/easymeet/pi-easymeet-bridge/src/index.ts"
     ]
   }
   ```
   (Merge with existing settings; only the extension entry is required.)
3. **Configure the bridge** – the extension reads `~/.pi/agent/easymeet.json` (copied automatically from `pi-easymeet-bridge/easymeet.json` on first run). Example:
   ```json
   {
     "serverUrl": "https://easymeet.easyroomtools.tech/",
     "roomCode": "ZOCKERTAG",
     "displayName": "Pi Assistant",
     "password": "",
     "clientId": "",
     "requireMention": true,
     "respondToQuestions": false,
     "wakeWords": [
       "pi"
     ],
     "respondOnlyTo": [],
     "ignoreParticipants": []
   }
   ```
   | Field                | Description                                                                            |
   |----------------------|----------------------------------------------------------------------------------------|
   | `serverUrl`          | Base URL of the EasyMeet server (e.g. `https://easymeet.easyroomtools.tech/`)          |
   | `roomCode`           | Join code / identifier of the target room                                              |
   | `displayName`        | Name shown for the bridge participant inside EasyMeet                                  |
   | `password`           | Optional room password                                                                 |
   | `clientId`           | Unique client identifier (empty → generated on first connect)                          |
   | `requireMention`     | `true` (default) → only forward messages that mention a wake word. Set `false` to respond to every message (sample above). |
   | `respondToQuestions` | `false` (default) → set to `true` to allow question-mark messages through even without a mention |
   | `wakeWords`          | Additional aliases that count as mentions (case-insensitive). Default includes `"pi"`. Leave empty when `requireMention` is `false`. |
   | `respondOnlyTo`      | Optional allowlist of participant nicknames. When set, only messages from these names are forwarded. |
   | `ignoreParticipants` | Optional blocklist of participant nicknames. Messages from these names are never forwarded. |
4. **Use the commands inside pi**:
   | Command               | Purpose                                |
   |-----------------------|----------------------------------------|
   | `/easymeet-setup`     | Edit server URL, room code, password   |
   | `/easymeet-connect`   | Join the configured EasyMeet room      |
   | `/easymeet-disconnect`| Leave the room / stop the bridge       |
   | `/easymeet-status`    | Show current bridge status             |

When connected:

- All chat lines are stored as hidden observations so the agent can follow the conversation without necessarily replying.
- You can allowlist or ignore specific EasyMeet nicknames via `respondOnlyTo` and `ignoreParticipants`.
- The default wake word list already contains `pi`, so messages addressing “pi” will be forwarded when mentions are required.
- Messages are only forwarded as prompts when they contain a wake word (case-insensitive) or, if `respondToQuestions` is enabled, look like a question. That keeps responses focused on messages that actually address the agent.
- Forwarded messages show up in pi prefixed with `[easymeet] <nick>: …` and may trigger a reply.
- During EasyMeet-driven turns, system-level tools (`bash`, `write`, `edit`, `apply_patch`, `delete`, `copy`, `python`, `node`) are blocked automatically to keep shared conversations from executing host-side commands.
- Assistant replies are sent back to the EasyMeet room under the configured `displayName`.

---

## Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** – How to contribute
- **[SECURITY.md](SECURITY.md)** – Security policy and responsible disclosure

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
