# EasyMeet

**P2P video conferencing in the browser** – Chat, file sharing, screen sharing, and virtual backgrounds. No installation, no app – everything runs directly in the web browser.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF.svg)](https://vitejs.dev/)
[![PeerJS](https://img.shields.io/badge/PeerJS-WebRTC-blue.svg)](https://peerjs.com/)
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
| **P2P Video Conferencing** | Host ↔ Viewer(s) directly via WebRTC – no media servers, low latency |
| **Audio & Video** | Microphone, camera, mute, video on/off |
| **Device Switching** | Switch microphone and camera during calls (exact constraint for reliable selection) |
| **Screen Sharing** | `getDisplayMedia` with optional system audio |
| **Chat** | Text messages, emojis, GIFs (Tenor/Giphy) |
| **File Sharing** | Files via P2P; folders as ZIP |
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
| **Realtime** | PeerJS, WebRTC |
| **UI** | Lucide Icons |
| **Virtual Backgrounds** | MediaPipe Tasks Vision, Selfie Segmentation |
| **Other** | bcrypt, qrcode, fflate, sdp-transform |
| **Deployment** | Docker, docker-compose |

---

## Quick Start

### Prerequisites

- **Node.js** 20 or higher
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

### Production Build

```bash
npm run build
npm run preview   # Preview the build
```

**URLs:**
- Frontend: `http://localhost:5173`
- API: `http://localhost:3001` (Vite proxy under `/api`)

---

## Project Structure

```
easymeet_patrick/
├── index.html              # HTML entry point
├── package.json            # Dependencies & scripts
├── vite.config.js          # Vite + API proxy
├── Dockerfile              # Multi-stage build
├── docker-compose.yml      # Production deployment
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
│   │   ├── network/        # api.js, peer.js
│   │   ├── media/          # devices.js, tiles.js
│   │   ├── ui/             # roomView.js, devices.js
│   │   └── storage/        # deviceStorage, customBackgroundStorage
│   │
│   ├── protocol/           # Messages, validation
│   ├── shared/             # result.js, constants.js
│   ├── ui/screens/         # landing, create-room, join-room, room-view
│   └── utils/              # crypto.js, folder-zip.js
│
├── server/                 # Express backend
│   ├── index.js            # API routes
│   ├── validate.js
│   └── password.js
│
├── public/
│   ├── mediapipe/          # WebAssembly models
│   └── backgrounds/        # Images for virtual backgrounds
│
├── docs/
│   └── WIKI.md             # Full documentation (German)
│
└── scripts/
    └── setup-mediapipe.js  # Download MediaPipe models
```

---

## Architecture

### Flow

1. **Host** creates a room (optional password)
2. **Server** registers the room and stores the host PeerId
3. **Viewer** joins via code/URL, receives host PeerId
4. **P2P** – Audio, video, chat, files run directly between host and viewer(s)

### Four-Layer Model

- **Layer 4 (I/O):** PeerJS, DOM, fetch, localStorage
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

### Running with Docker

```bash
# Run standalone
docker run -p 3001:3001 smotherer/easymeet:latest

# Run with custom port
docker run -p 8080:8080 -e PORT=8080 smotherer/easymeet:latest
```

### docker-compose

The included `docker-compose.yml` runs the app in a container and expects an external network named `frontend`:

```yaml
services:
  app:
    image: smotherer/easymeet:latest
    environment:
      - PORT=3001
      - NODE_ENV=production
    networks:
      - frontend

networks:
  frontend:
    external: true
```

**Create the network first:**

```bash
docker network create frontend
```

**Start:**

```bash
docker-compose up -d
```

**Without external network** – use this minimal compose file:

```yaml
services:
  app:
    image: smotherer/easymeet:latest
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - NODE_ENV=production
```

### Dockerfile Details

| Stage | Base Image | Purpose |
|-------|------------|---------|
| `builder` | `node:20-alpine` | `npm ci`, `npm run build` → produces `dist/` |
| Production | `node:20-alpine` | Copies `dist/` and `server/`, runs `node server/index.js` |

The production image:
- Serves static files from `dist/`
- Handles API routes under `/api`
- Falls back to `index.html` for SPA routing
- Exposes port 3001

---

## Documentation

- **Full documentation (German):** [docs/WIKI.md](docs/WIKI.md)
- Covers: Project structure, architecture, API reference, configuration, development, deployment
- **[CONTRIBUTING.md](CONTRIBUTING.md)** – How to contribute
- **[CHANGELOG.md](CHANGELOG.md)** – Version history

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
