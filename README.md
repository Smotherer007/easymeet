# EasyMeet

**Browser video conferencing (mediasoup SFU)** – Chat, file sharing, screen sharing, and virtual backgrounds. No installation, no app – everything runs directly in the web browser; media and signaling go through your **EasyMeet server**.

[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF.svg)](https://vitejs.dev/)
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

| Feature                 | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Video Conferencing**  | Audio/Video über **mediasoup** (SFU auf dem Server)                                  |
| **Audio & Video**       | Microphone, camera, mute, video on/off                                               |
| **Device Switching**    | Switch microphone and camera during calls (exact constraint for reliable selection)  |
| **Screen Sharing**      | `getDisplayMedia` with optional system audio                                         |
| **Chat**                | Text messages, emojis, GIFs (Tenor/Giphy)                                            |
| **File Sharing**        | Files via **Protoo/easymeet** chunks to the room (server-vermittelt); folders as ZIP |
| **Virtual Backgrounds** | Blur, preset images (e.g. The Office, Matrix), custom uploads                        |
| **Speaking Indicator**  | Visual display of speaking activity                                                  |
| **Voice Rooms**         | Audio-only mode for voice-only conferences                                           |
| **Room Management**     | Password protection, optional room code, join via code or URL                        |
| **Video Layout**        | Grid and free mode (draggable windows)                                               |
| **Volume Slider**       | Per-participant volume in video tiles and participant list                           |
| **i18n**                | German and English                                                                   |

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

| Area                    | Technology                                                     |
| ----------------------- | -------------------------------------------------------------- |
| **Frontend**            | Vite 7, Vanilla JS (ES Modules), CSS                           |
| **Backend**             | Node.js, Express                                               |
| **Realtime**            | mediasoup (SFU), Protoo-WebSocket (wie mediasoup-demo), WebRTC |
| **UI**                  | Lucide Icons                                                   |
| **Virtual Backgrounds** | MediaPipe Tasks Vision, Selfie Segmentation                    |
| **Other**               | bcrypt, qrcode, fflate, protoo-client                          |
| **Deployment**          | Docker, docker-compose                                         |

---

## Quick Start

### Prerequisites

- **Node.js** 22 or higher (Voraussetzung für aktuelle **mediasoup**-Versionen)
- **npm**

### Installation

```bash
git clone https://github.com/Smotherer007/easymeet.git
cd easymeet
npm install
```

The postinstall script automatically downloads MediaPipe models for virtual backgrounds.

Optional environment variables: see [.env.example](.env.example) (e.g. `TENOR_API_KEY` for GIF search).

### Development

```bash
# Frontend (Vite) – http://localhost:5173
npm run dev

# Backend (Express) – http://localhost:3001
npm run server

# Both in parallel
npm run dev:all
```

**Hinweis:** Nur `npm run dev` startet **kein** Backend. Dann schlagen Aufrufe wie `/api/join` fehl (`vite http proxy error … ECONNREFUSED`). Immer **`npm run dev:all`** nutzen oder in einem zweiten Terminal **`npm run server`**. Ziel-URL des Proxys: `VITE_PROXY_API_TARGET` in **`.env`** im Repo-Root (Standard: `http://localhost:3001`).

**Konfiguration (lokal):** **`cp .env.example .env`**, optional **`cp persistent-rooms.example.json persistent-rooms.json`**. Vite und der Server nutzen dieselbe **`.env`** im Repo-Root; **`EASYMEET_PERSISTENT_ROOMS`** ist relativ zum **Repo-Root** (Standard: `persistent-rooms.json`). Optional: **`server/.env`** überschreibt einzelne Variablen. Hattest du noch **`config/.env`** (ältere Struktur), Inhalt nach **`.env`** im Root übernehmen.

**Troubleshooting (lokal):**

- **`persistent-rooms: file missing …/config/persistent-rooms.json`:** In **`.env`** **`EASYMEET_PERSISTENT_ROOMS`** auf **`persistent-rooms.json`** setzen (nicht mehr unter **`config/`**), oder die Zeile entfernen und **`persistent-rooms.json`** im Repo-Root anlegen.
- **`npm install` scheitert an mediasoup** (`SSL: CERTIFICATE_VERIFY_FAILED` beim Download von **libuv**, siehe `node_modules/mediasoup/worker/out/Release/build/meson-logs/meson-log.txt`): Zuerst versucht mediasoup einen **Prebuild** von GitHub (`mediasoup-worker-…-darwin-arm64.tgz`); schlägt das fehl, wird **lokal** mit **Python** gebaut — und genau dieser Python (oft **`/Library/Frameworks/Python.framework/...`** von **python.org**) hat auf dem Mac häufig **keine** Root-Zertifikate.
    1. **Empfohlen:** Im Finder **Applications → Python 3.x** das Skript **`Install Certificates.command`** ausführen (oder in der [Python-Doku](https://www.python.org/downloads/macos/) nach „Install Certificates“ suchen).
    2. **Alternative:** Python von **Homebrew** nutzen, das meist korrekte CAs mitbringt: `brew install python@3.12`, dann z. B. **`PYTHON=/opt/homebrew/bin/python3.12 npm install`** (Apple-Silicon; bei Intel oft **`/usr/local/bin/python3.12`**).
    3. Danach: **`rm -rf node_modules/mediasoup`** (bei halbinstalliertem Baum) und im Repo-Root erneut **`npm install`**, ggf. **`npm run rebuild:mediasoup`**.
- **`mediasoup-worker` ENOENT** (Server startet, aber kein Binary): gleiche Ursache — Worker wurde nie fertig gebaut; obenstehende Schritte, dann **`npm install`** bzw. **`npm run rebuild:mediasoup`**.

### Production Build

```bash
npm run build
npm run preview # Preview the build
```

**URLs:**

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001` (Vite proxy under `/api`)

**Medien / Protoo:** Auf **Vite-Dev** (`:5173`) verbindet der Client **direkt** mit `ws(s)://<host>:3001/ws` (Subprotokoll `protoo` — Vite-WS-Proxy oft ungeeignet). Logs: **`[easymeet/ms]`**. Port: `VITE_MEDIASOUP_PROTOO_PORT`.

**Production / Nginx Proxy Manager:** Protoo nutzt **`wss://<deine-domain>/ws`** (gleiche Origin wie die Seite, **kein** `:3001` in der URL). Der Proxy muss **WebSocket-Upgrade** für den Pfad **`/ws`** zum Node-Backend (z. B. `http://easymeet:3001`) durchreichen. `vite preview` o. Ä. ohne Proxy: optional **`VITE_MEDIASOUP_PROTOO_DIRECT=true`** in **`.env`** (Build-Zeit).

---

## Project Structure

**Monorepo (npm workspaces):** Root-`package.json` orchestriert **`client/`** (Vite-Frontend) und **`server/`** (Express + mediasoup). Die REST-Payload-Parser für Create/Join liegen **doppelt** unter `client/src/shared/roomApiPayloads.js` und `server/src/shared/roomApiPayloads.js` (bei Änderungen beide anpassen).

```
easymeet/
├── package.json            # Workspaces, Scripts (dev, dev:all, build, …)
├── client/                 # Vite SPA
│   ├── package.json
│   ├── vite.config.js      # Dev-Proxy /api, /ws
│   ├── index.html
│   ├── public/             # favicon, sounds, …
│   └── src/
│       ├── main.js
│       ├── app/            # bootstrap, Composition Root
│       ├── domain/
│       ├── store/
│       ├── effects/
│       ├── protocol/
│       ├── shared/         # result, constants, roomApiPayloads (…)
│       ├── ui/screens/
│       └── utils/
├── server/                 # Express + mediasoup + Protoo (eigenes package.json)
│   ├── package.json
│   ├── .env.example        # optional: server/.env Overrides
│   └── src/
│       ├── index.js
│       ├── logger.js
│       ├── validate.js
│       ├── mediasoup/
│       ├── shared/         # roomApiPayloads (Duplikat zum Client)
│       └── …
├── .env.example            # Vorlage → .env (gitignored)
├── .env.production.example
├── persistent-rooms.example.json
├── persistent-rooms.default.json
├── Dockerfile
├── docker-compose.yml
└── docs/
    └── WIKI.md
```

**Logging:** Server: `EASYMEET_LOG_LEVEL` (`silent` \| `error` \| `warn` \| `info` \| `debug`, Standard `info`). Client: `VITE_LOG_LEVEL` in **`.env`** im Repo-Root (gleiche Stufen). Präfixe in der Konsole: `easymeet/server`, `easymeet/protoo`, `easymeet/mediasoup`, `easymeet/api`, `easymeet/ms`, `easymeet/app`.

---

## Architecture

### Flow

1. **Host** creates a room (optional password)
2. **Server** registers the room and startet einen **mediasoup-Router** pro Raum
3. **Teilnehmer** joinen via Code/URL; **WebRTC** läuft Client ↔ Server (SFU), nicht rein P2P
4. **Chat/Dateien** über Protoo-Notifications (`easymeet.*`); Medien über **Producer/Consumer** und server-getriebene **`newConsumer`** (übliches mediasoup/Protoo-Muster)

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

| Method  | Path                 | Description                                                          |
| ------- | -------------------- | -------------------------------------------------------------------- |
| `POST`  | `/api/rooms`         | Create a new room                                                    |
| `PATCH` | `/api/rooms/:roomId` | Register host PeerId                                                 |
| `POST`  | `/api/join`          | Join a room (returns server `peerId` + one-time `wsToken` for `/ws`) |
| `GET`   | `/api/rooms/:roomId` | Check room status                                                    |

**Example – Create room:**

```bash
curl -X POST http://localhost:3001/api/rooms \
	-H "Content-Type: application/json" \
	-d '{"password": "optional", "roomCode": "ABC123"}'
```

**Response:** `{ "roomId": "ABC123", "hostPeerId": null }`

**Join (then WebSocket):** `POST /api/join` with JSON `{ "identifier": "ABC123", "password": "" }` returns `{ "roomId", "peerId", "wsToken" }`. The client opens **`/ws?roomId=…&peerId=…&token=…`** with exactly those values; the token is **one-time** (~10 min TTL). Raum-Ersteller rufen nach `POST /api/rooms` dieselbe Join-Route auf, um `peerId`/`wsToken` zu erhalten.

### Persistent rooms (config)

Fixed rooms can be created **on every server start** and are **not deleted** by the 24h TTL cleanup (dynamic rooms still expire).

1. Set **`EASYMEET_PERSISTENT_ROOMS`** in **`.env`** to the JSON file path (**relative to the repository root** or absolute). See **`.env.example`** (default: `persistent-rooms.json`).
2. Copy **`persistent-rooms.example.json`** → **`persistent-rooms.json`** (gitignored) and edit.

```json
{
	"rooms": [{ "id": "OPENLOBBY" }, { "id": "STANDUP", "passwordEnv": "EASYMEET_ROOM_STANDUP_PASSWORD" }, { "id": "TEAM", "password": "only-if-deployment-is-trusted" }]
}
```

- **`id`** or **`roomId`**: room code (same normalization as join: alphanumeric, uppercase).
- **`password`**: optional; omit or empty for an open room.
- **`passwordEnv`**: read the password from that environment variable (good for Docker secrets).

At startup you should see: `persistent-rooms: N Raum/Räume … geladen (TTL ausgenommen)`.

---

## Docker

### Overview

The application uses a **multi-stage Docker build**:

1. **Stage 1 (builder):** Builds the frontend with Vite, outputs `dist/`
2. **Stage 2 (production):** Node.js Alpine image serving static files and the Express API from a single process

In production, the Express server serves both the API (`/api/*`) and the static frontend (`dist/`) on one port.

### Build & Push

```bash
# Build image (linux/amd64)
npm run docker:build

# Push to registry
npm run docker:push

# Build and push
npm run docker:build:and:push
```

**Image:** `smotherer/easymeet:latest`

### GitHub Actions (CI/CD)

Bei jedem Push auf `main` baut und pusht eine GitHub Action automatisch das Docker-Image zu Docker Hub.

**Einrichtung:** In den GitHub Repository Settings → Secrets and variables → Actions zwei Secrets anlegen:

| Secret               | Beschreibung                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `DOCKERHUB_USERNAME` | Dein Docker Hub Benutzername (z.B. `smotherer`)                                                       |
| `DOCKERHUB_TOKEN`    | Access Token von [Docker Hub → Account Settings → Security](https://hub.docker.com/settings/security) |

Die Pipeline kann auch manuell unter **Actions → Build and Push Docker Image → Run workflow** gestartet werden.

### Environment Variables

| Variable                         | Default                                   | Description                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                           | `3001`                                    | Port the server listens on                                                                                                                                                                                             |
| `NODE_ENV`                       | `production`                              | Set automatically in Dockerfile                                                                                                                                                                                        |
| `TENOR_API_KEY`                  | `LIVDSRZULELA` (Tenor demo key)           | API key for GIF search; never exposed to client                                                                                                                                                                        |
| `MEDIASOUP_ANNOUNCED_IP`         | _(leer)_                                  | **Wichtig in Docker/Cloud:** öffentliche IP oder Hostname für ICE (sonst oft kein Video/Audio). Siehe [mediasoup WebRtcTransportOptions](https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions) |
| `MEDIASOUP_LISTEN_IP`            | `0.0.0.0`                                 | Bind-Adresse des WebRTC-Transports                                                                                                                                                                                     |
| `RTC_MIN_PORT` / `RTC_MAX_PORT`  | `40000`–`40200`                           | UDP-Portbereich für RTP (muss intern bis zum Container durchgereicht werden, z. B. Proxy)                                                                                                                              |
| `EASYMEET_PERSISTENT_ROOMS`      | `persistent-rooms.json` in `.env.example` | Path to JSON with `{"rooms":[...]}` (**relative to repo root** or absolute). Omit to disable pinned rooms (unless JSON env is set).                                                                                    |
| `EASYMEET_PERSISTENT_ROOMS_JSON` | _(leer)_                                  | Optional: entire rooms JSON in one env string (overrides file). For Docker Compose without mounting the JSON file.                                                                                                     |

**Docker / Compose:** **`env_file: ./.env`**. Das Image enthält eine Standard-**`persistent-rooms.json`** (Dockerfile); zum Überschreiben **ohne** Image-Rebuild: **`EASYMEET_PERSISTENT_ROOMS_JSON`** in **`.env`**. Weitere Werte in der YAML: **`environment:`** (siehe Kommentar in **`docker-compose.yml`**).

**Container startet nicht / Port 40000 belegt:** Das Repo hat **keine** `ports:` in `docker-compose.yml`. Häufig stammt das Mapping von **`docker-compose.override.yml`** (wird automatisch gemerged). Prüfen mit `docker compose config` – Details: [docs/docker-compose-troubleshooting.md](docs/docker-compose-troubleshooting.md).

**Nginx Proxy Manager / WebSocket:** [docs/nginx-proxy-manager-protoo.md](docs/nginx-proxy-manager-protoo.md) – `/ws` muss als WebSocket zum Backend (Port 3001 intern) durchgereicht werden.

### Running with Docker

```bash
# Nur .env (z. B. mit EASYMEET_PERSISTENT_ROOMS_JSON für feste Räume)
docker run -p 3001:3001 -p 40000-40200:40000-40200/udp \
	--env-file ./.env \
	smotherer/easymeet:latest

# Optional: JSON vom Host mounten statt EASYMEET_PERSISTENT_ROOMS_JSON in .env
docker run -p 3001:3001 -p 40000-40200:40000-40200/udp \
	--env-file ./.env \
	-v "$(pwd)/persistent-rooms.json:/app/persistent-rooms.json:ro" \
	smotherer/easymeet:latest
```

### docker-compose

Die `docker-compose.yml` erwartet ein externes Netz **`frontend`**. Standard: nur **`./.env`** (`cp .env.example .env`). Feste Räume per **`EASYMEET_PERSISTENT_ROOMS_JSON`** in dieser Datei — **kein Volume nötig**.

```bash
cp .env.example .env
docker network create frontend
docker compose up -d
# oder: npm run docker:up
```

Willst du stattdessen **`persistent-rooms.json`** auf dem Host bearbeiten, in **`docker-compose.yml`** den **`volumes:`**-Block (Kommentar entfernen) aktivieren und die Datei aus **`persistent-rooms.example.json`** anlegen.

Die **Compose-Datei veröffentlicht keine `ports:`** – der Dienst ist nur im Netz `frontend` erreichbar (z. B. Reverse-Proxy). **UDP 40000–40200** muss für WebRTC bis zu diesem Container durchgereicht werden (gleicher Bereich wie `RTC_*`).

**Nur YAML:** Unter `services.app.environment:` feste Werte eintragen (überschreiben **`env_file`**).

**Lokal mit Host-Ports** – optional `ports:` ergänzen, z. B. `"3001:3001"` und `40000-40200:40000-40200/udp`.

### Dockerfile Details

| Stage      | Base Image              | Purpose                                                                         |
| ---------- | ----------------------- | ------------------------------------------------------------------------------- |
| `builder`  | `node:22-bookworm-slim` | Workspaces `npm ci`, `npm run build` → `client/dist/`                           |
| Production | `node:22-bookworm-slim` | mediasoup-Prebuild (glibc); Fallback-Build: `python3`, `pip`, `build-essential` |

The production image:

- **Keine** Konfig im Image — zur Laufzeit per Compose **`env_file`**; optional Bind **`persistent-rooms.json`** (Kommentar in **`docker-compose.yml`**) bzw. `docker run --env-file …` und nur bei Bedarf `-v …`
- Serves static files from `client/dist/`
- Handles API routes under `/api`
- Falls back to `index.html` for SPA routing
- **Keine `EXPOSE`** im Dockerfile; lauscht intern auf `PORT` (Standard 3001)

---

## Documentation

- **Wiki (Entwicklung):** EasyMeet – Entwickler- & Architektur-Dokumentation; Kurzverweis: [docs/WIKI.md](docs/WIKI.md)
- Covers: Project structure, architecture, API reference, configuration, development, deployment
- **[CONTRIBUTING.md](CONTRIBUTING.md)** – How to contribute

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
