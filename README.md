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

| Feature | Description |
|---------|-------------|
| **Video Conferencing** | Audio/Video über **mediasoup** (SFU auf dem Server) |
| **Audio & Video** | Microphone, camera, mute, video on/off |
| **Device Switching** | Switch microphone and camera during calls (exact constraint for reliable selection) |
| **Screen Sharing** | `getDisplayMedia` with optional system audio |
| **Chat** | Text messages, emojis, GIFs (Tenor/Giphy) |
| **File Sharing** | Files via **Protoo/easymeet** chunks to the room (server-vermittelt); folders as ZIP |
| **Virtual Backgrounds** | Blur, preset images (e.g. The Office, Matrix), custom uploads |
| **Speaking Indicator** | Visual display of speaking activity |
| **Voice Rooms** | Audio-only mode for voice-only conferences |
| **Room Management** | Password protection, optional room code, join via code or URL |
| **Video Layout** | Grid and free mode (draggable windows) |
| **Volume Slider** | Per-participant volume in video tiles and participant list |
| **i18n** | German and English |

---

## Screenshots & Demo

**[→ Live Demo](https://easymeet.easyroomtools.tech/)**

*Landing page → Create/join room → Room view with video, chat, participant list*

The app provides a clear interface with:
- **Landing:** Quick access to "Create room" and "Join room"
- **Create Room:** Password, optional room code, QR code for mobile participation
- **Join Room:** Room code input, password if required
- **Room View:** Video grid, chat, participant list, settings, screen sharing

---

## Tech Stack

| Area | Technology |
|------|-------------|
| **Frontend** | Vite 7, Vanilla JS (ES Modules), CSS |
| **Backend** | Node.js, Express |
| **Realtime** | mediasoup (SFU), Protoo-WebSocket (wie mediasoup-demo), WebRTC |
| **UI** | Lucide Icons |
| **Virtual Backgrounds** | MediaPipe Tasks Vision, Selfie Segmentation |
| **Other** | bcrypt, qrcode, fflate, protoo-client |
| **Deployment** | Docker, docker-compose |

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

**Hinweis:** Nur `npm run dev` startet **kein** Backend. Dann schlagen Aufrufe wie `/api/join` fehl (`vite http proxy error … ECONNREFUSED`). Immer **`npm run dev:all`** nutzen oder in einem zweiten Terminal **`npm run server`**. Ziel-URL des Proxys: `VITE_PROXY_API_TARGET` in `.env` (Standard: `http://localhost:3001`).

**Feste Räume (lokal):** `cp .env.example .env` und `cp config/persistent-rooms.example.json config/persistent-rooms.json` – der Server liest den Pfad aus **`EASYMEET_PERSISTENT_ROOMS`** (siehe `.env.example`).

### Production Build

```bash
npm run build
npm run preview   # Preview the build
```

**URLs:**
- Frontend: `http://localhost:5173`
- API: `http://localhost:3001` (Vite proxy under `/api`)

**Medien / Protoo:** Auf **Vite-Dev** (`:5173`) verbindet der Client **direkt** mit `ws(s)://<host>:3001/ws` (Subprotokoll `protoo` — Vite-WS-Proxy oft ungeeignet). Logs: **`[easymeet/ms]`**. Port: `VITE_MEDIASOUP_PROTOO_PORT`.

**Production / Nginx Proxy Manager:** Protoo nutzt **`wss://<deine-domain>/ws`** (gleiche Origin wie die Seite, **kein** `:3001` in der URL). Der Proxy muss **WebSocket-Upgrade** für den Pfad **`/ws`** zum Node-Backend (z. B. `http://easymeet:3001`) durchreichen. `vite preview` o. Ä. ohne Proxy: optional **`VITE_MEDIASOUP_PROTOO_DIRECT=true`** in `.env` (Build-Zeit).

---

## Project Structure

```
easymeet_patrick/
├── index.html              # HTML entry point
├── package.json            # Dependencies & scripts
├── vite.config.js          # Vite + API proxy
├── Dockerfile              # Multi-stage build
├── docker-compose.yml      # Production deployment
├── electron/               # Desktop-Client (Electron, lädt Web-URL)
├── config/
│   └── persistent-rooms.example.json  # Vorlage → persistent-rooms.json (gitignored)
│
├── src/
│   ├── main.js             # App entry, bootstrap
│   ├── style.css           # Global styles
│   ├── i18n.js             # Internationalization (DE/EN)
│   ├── icons.js            # Lucide icons
│   ├── speaking-indicator.js
│   │
│   ├── app/                # Orchestration
│   │   ├── bootstrap.js    # Composition root
│   │   └── index.js        # App logic
│   │
│   ├── domain/             # Domain logic
│   │   ├── events/         # Event definitions
│   │   ├── reducers/       # appReducer, initialState
│   │   ├── selectors/      # State selectors
│   │   └── invariants/     # Invariants
│   │
│   ├── store/              # State management
│   ├── effects/            # I/O & side effects
│   │   ├── network/        # api.js, mediasoupClient.js
│   │   ├── media/          # devices.js, tiles.js
│   │   ├── ui/             # roomView.js, devices.js
│   │   └── storage/        # deviceStorage, customBackgroundStorage
│   │
│   ├── protocol/           # Messages, validation
│   ├── shared/             # result.js, constants.js
│   ├── ui/screens/         # landing, create-room, join-room, room-view
│   └── utils/              # crypto.js, folder-zip.js
│
├── server/                 # Express + mediasoup + Protoo
│   ├── index.js            # API routes, HTTP server
│   ├── mediasoup/          # rooms, protooSignaling, config
│   ├── validate.js
│   └── password.js
│
├── public/
│   ├── mediapipe/          # WebAssembly models
│   └── backgrounds/        # Images for virtual backgrounds
│
├── docs/
│   └── WIKI.md             # Verweis auf internes Wiki (Sammlung „Entwicklung“)
│
└── scripts/
    └── setup-mediapipe.js  # Download MediaPipe models
```

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

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/rooms` | Create a new room |
| `PATCH` | `/api/rooms/:roomId` | Register host PeerId |
| `POST` | `/api/join` | Join a room |
| `GET` | `/api/rooms/:roomId` | Check room status |

**Example – Create room:**

```bash
curl -X POST http://localhost:3001/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"password": "optional", "roomCode": "ABC123"}'
```

**Response:** `{ "roomId": "ABC123", "hostPeerId": null }`

### Persistent rooms (config)

Fixed rooms can be created **on every server start** and are **not deleted** by the 24h TTL cleanup (dynamic rooms still expire).

1. Set **`EASYMEET_PERSISTENT_ROOMS`** in **`.env`** to the JSON file path (relative to the process working directory or absolute). See **`.env.example`** (default: `config/persistent-rooms.json`).
2. Copy **`config/persistent-rooms.example.json`** → **`config/persistent-rooms.json`** (gitignored) and edit.

```json
{
  "rooms": [
    { "id": "OPENLOBBY" },
    { "id": "STANDUP", "passwordEnv": "EASYMEET_ROOM_STANDUP_PASSWORD" },
    { "id": "TEAM", "password": "only-if-deployment-is-trusted" }
  ]
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

| Secret | Beschreibung |
|--------|--------------|
| `DOCKERHUB_USERNAME` | Dein Docker Hub Benutzername (z.B. `smotherer`) |
| `DOCKERHUB_TOKEN` | Access Token von [Docker Hub → Account Settings → Security](https://hub.docker.com/settings/security) |

Die Pipeline kann auch manuell unter **Actions → Build and Push Docker Image → Run workflow** gestartet werden.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port the server listens on |
| `NODE_ENV` | `production` | Set automatically in Dockerfile |
| `TENOR_API_KEY` | `LIVDSRZULELA` (Tenor demo key) | API key for GIF search; never exposed to client |
| `MEDIASOUP_ANNOUNCED_IP` | _(leer)_ | **Wichtig in Docker/Cloud:** öffentliche IP oder Hostname für ICE (sonst oft kein Video/Audio). Siehe [mediasoup WebRtcTransportOptions](https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions) |
| `MEDIASOUP_LISTEN_IP` | `0.0.0.0` | Bind-Adresse des WebRTC-Transports |
| `RTC_MIN_PORT` / `RTC_MAX_PORT` | `40000`–`40200` | UDP-Portbereich für RTP (muss intern bis zum Container durchgereicht werden, z. B. Proxy) |
| `EASYMEET_PERSISTENT_ROOMS` | `config/persistent-rooms.json` in `.env.example` | Path to JSON with `{"rooms":[...]}` (relative to cwd or absolute). Omit to disable pinned rooms. |

**Docker:** Das Image setzt **`EASYMEET_PERSISTENT_ROOMS=/app/config/persistent-rooms.json`** und enthält eine **Standard-JSON** (Raum **`LOBBY`**, Quelle **`config/persistent-rooms.default.json`**), damit „Feste Räume“ ohne extra Setup funktionieren. **Eigene Räume:** `persistent-rooms.json` auf dem Host erstellen und per Compose-Volume mounten (siehe `docker-compose.yml`). Vorlage: **`config/persistent-rooms.example.json`**. Produktion: **`.env.production.example`** inkl. `MEDIASOUP_ANNOUNCED_IP`.

**Container startet nicht / Port 40000 belegt:** Das Repo hat **keine** `ports:` in `docker-compose.yml`. Häufig stammt das Mapping von **`docker-compose.override.yml`** (wird automatisch gemerged). Prüfen mit `docker compose config` – Details: [docs/docker-compose-troubleshooting.md](docs/docker-compose-troubleshooting.md).

**Nginx Proxy Manager / WebSocket:** [docs/nginx-proxy-manager-protoo.md](docs/nginx-proxy-manager-protoo.md) – `/ws` muss als WebSocket zum Backend (Port 3001 intern) durchgereicht werden.

### Running with Docker

```bash
# Standalone – Ports nur bei Bedarf an den Host binden (Image setzt keine EXPOSE)
docker run -p 3001:3001 -p 40000-40200:40000-40200/udp smotherer/easymeet:latest

# Ohne Host-Mapping (nur internes Netz / anderer Stack)
docker run --network=frontend smotherer/easymeet:latest
```

### docker-compose

Die `docker-compose.yml` erwartet ein externes Netz `frontend` und liest optional eine **`.env`** (Vorlage: **`.env.example`**) für IP, Ports und feste Räume.

```bash
cp .env.example .env
cp config/persistent-rooms.example.json config/persistent-rooms.json
# .env: MEDIASOUP_ANNOUNCED_IP; Compose-Volume für config/persistent-rooms.json siehe docker-compose.yml
docker network create frontend
docker compose up -d
```

Die **Compose-Datei veröffentlicht keine `ports:`** – der Dienst ist nur im Netz `frontend` erreichbar (z. B. Reverse-Proxy). **UDP 40000–40200** muss für WebRTC bis zu diesem Container durchgereicht werden (gleicher Bereich wie `RTC_*`).

Kurzüberblick:

```yaml
services:
  app:
    image: smotherer/easymeet:latest
    env_file:
      - path: .env
        required: false
    environment:
      - PORT=${PORT:-3001}
      - MEDIASOUP_ANNOUNCED_IP=${MEDIASOUP_ANNOUNCED_IP:-}
    networks:
      - frontend
networks:
  frontend:
    external: true
```

**Lokal mit Host-Ports** – optional `ports:` ergänzen, z. B. `"3001:3001"` und `40000-40200:40000-40200/udp`.

### Dockerfile Details

| Stage | Base Image | Purpose |
|-------|------------|---------|
| `builder` | `node:22-bookworm-slim` | `npm ci`, `npm run build` → produces `dist/` |
| Production | `node:22-bookworm-slim` | mediasoup-Prebuild (glibc); Fallback-Build: `python3`, `pip`, `build-essential` |

The production image:
- Enthält **`persistent-rooms.default.json`** (→ eingebaute **`persistent-rooms.json`**) und **`persistent-rooms.example.json`**; eigene Liste per Volume (siehe `docker-compose.yml`)
- Serves static files from `dist/`
- Handles API routes under `/api`
- Falls back to `index.html` for SPA routing
- **Keine `EXPOSE`** im Dockerfile; lauscht intern auf `PORT` (Standard 3001)

### Desktop (Electron)

Ordner **`electron/`**: schlanke **Electron-App**, die die Web-UI per URL lädt (Standard: öffentliche Demo, Dev: `http://localhost:5173`). **Server-Adresse** lässt sich im App-Menü setzen und wird persistent gespeichert (siehe `electron/README.md`).

```bash
cd electron && npm install
npm run electron:dev    # aus Repo-Root, vorher: npm run dev:all
# oder aus electron/: npm run start:dev
```

Details: **[electron/README.md](electron/README.md)**.

---

## Documentation

- **Wiki (Entwicklung):** EasyMeet – Entwickler- & Architektur-Dokumentation; Kurzverweis: [docs/WIKI.md](docs/WIKI.md)
- Covers: Project structure, architecture, API reference, configuration, development, deployment
- **[CONTRIBUTING.md](CONTRIBUTING.md)** – How to contribute

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
