# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Docker:** `.env.example`, `docker-compose.yml` mit optionalem `env_file: .env`, HTTP-Port-Mapping und zentral dokumentierten Variablen; **Dockerfile**-Kommentar zu Laufzeit-Env.
- **Persistente Räume** per JSON-Datei, Pfad in **`EASYMEET_PERSISTENT_ROOMS`** (`.env`); Vorlage **`config/persistent-rooms.example.json`** → `config/persistent-rooms.json` (gitignored). **24h-TTL** greift nicht. Startseite: **„Feste Räume“** via `GET /api/rooms/pinned`.
- Startseite: Liste **aktuell aktiver Räume** (mindestens eine Person im VoIP-Raum), API `GET /api/rooms/active`; die beiden Einstiegs-Kacheln sind ab ~640px Breite **nebeneinander**.
- Raum-IDs für Protoo/mediasoup und die aktive-Liste werden **einheitlich normalisiert** (Großbuchstaben, ohne Sonderzeichen), damit die Liste zuverlässig zum HTTP-Raum passt.

### Changed

- Medien, Chat, Dateien und Bildschirmfreigabe laufen über **mediasoup + Protoo** auf dem Server (kein PeerJS mehr).
- **Dockerfile:** **`node:22-bookworm-slim`** statt Alpine – mediasoup-**Prebuild** (glibc) läuft typisch ohne langes Kompilat; Fallback-Build mit `python3`/`pip`/`build-essential`. Zuvor: Node 22 Alpine + `py3-pip`.
- Server lädt optional **`dotenv`** (`import 'dotenv/config'`), damit eine **`.env` im Projektroot** bei `npm run server` erkannt wird (z. B. `EASYMEET_PERSISTENT_ROOMS`).

### Removed

- Alte Pfade **`server/persistent-rooms*.json`** – ersetzt durch **`config/persistent-rooms.example.json`** + `config/persistent-rooms.json` und **`EASYMEET_PERSISTENT_ROOMS`**.
- Referenz-Clone `_reference/mediasoup-demo`, ungenutzte PeerJS-Module (`peer.js`, `peerHostHandlers.js`, `peerViewerHandlers.js`), Abhängigkeiten `peerjs`, `sdp-transform`, `websocket` (root).

## [0.1.0] - 2025-03-14

### Added

- P2P video conferencing via WebRTC (PeerJS)
- Audio & video with mute, device switching
- Screen sharing with optional system audio
- Chat with text, emojis, GIFs (Tenor/Giphy)
- File sharing (P2P, folders as ZIP)
- Virtual backgrounds (blur, presets, custom uploads)
- Speaking indicator
- Voice rooms (audio-only mode)
- Room management (password, room code, join via URL)
- Video layout (grid and free mode)
- Per-participant volume slider
- i18n (German, English)
- Docker support
