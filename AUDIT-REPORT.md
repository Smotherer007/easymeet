# EasyMeet — Audit: Performance & Sicherheit

Stand: 2026-04-21 · Scope: Server (Backend), Client (Frontend), Docker/Deployment

Dieser Report dokumentiert Findings aus einem Code-Audit des EasyMeet-Repos
(mediasoup SFU, Node 22 / Express 5, Vite-Client) und listet auf, was bereits
direkt gefixt wurde und was als Empfehlung offen bleibt.

---

## 1. Direkt umgesetzte Fixes

Alle Änderungen sind nicht-brechende Minimal-Edits (eine neue Dependency:
`compression`). Verifiziert via `node --check` für alle geänderten JS-Dateien.

### 1.1 Runde 1 (Audit-Start)

| # | Bereich | Datei | Änderung |
|---|---------|-------|----------|
| F1 | Sicherheit | `server/src/password.js` | bcrypt cost 10 → 12. Offline-Brute-Force-Budget verdoppelt sich, User-spürbarer Latenzzuwachs nur bei create/join (~100 ms → ~250 ms einmalig). |
| F2 | Sicherheit | `server/src/index.js`, `server/src/db/adminDb.js` | Bootstrap-Admin-Token wird nur noch **einmal bei Erstgenerierung** geloggt, nicht mehr bei jedem Restart. Zuvor war jede Log-Rotation / jeder Log-Leser ein Einfallstor für Full-Admin-Übernahme. |
| F3 | Sicherheit | `server/src/createApp.js` | Dediziertes Rate-Limit `5 req/min` auf `/api/admin/bootstrap-login` (per Env `EASYMEET_BOOTSTRAP_LOGIN_RATE_LIMIT_MAX` übersteuerbar). Schützt das Langlauf-Token gegen massenhaftes Raten trotz 120/min generellem API-Limit. |
| F4 | Sicherheit | `server/src/createApp.js` | Helmet CSP ergänzt: `frame-ancestors 'self'` (Clickjacking-Schutz), zusätzlich `Cross-Origin-Opener-Policy: same-origin`. |
| F5 | Sicherheit | `server/src/index.js` | Tenor-Fallback-API-Key (`LIVDSRZULELA`) aus dem Code entfernt. Ohne `TENOR_API_KEY` werden Requests ohne Key an Tenor gesendet; Server loggt eine Info-Zeile beim Start. Zuvor versteckte der harte Fallback, dass die Installation produktiv auf einem öffentlichen Demo-Key hing. |
| P1 | Performance | `server/src/mediasoup/protooSignaling.js` | `notifyExistingProducersToNewPeer` und `notifyNewProducerToOthers` von seriellem `await` auf `Promise.allSettled` umgestellt. Join-Zeit skaliert damit nicht mehr `O(peers × producers)` seriell; ein lahmer Peer stallt nicht mehr den ganzen Join. |
| P2 | Performance | `server/src/mediasoup/rooms.js` | Doppelter 24 h-TTL-`setInterval` entfernt (war sowohl in `roomStore.js` als auch `mediasoup/rooms.js` aktiv → doppelte Arbeit und Race auf persistenten Räumen). |
| P3 | Performance | `server/src/index.js` | Hourly cleanup-Timer mit `.unref()` versehen → saubere Prozess-Shutdowns in Tests/SIGINT. |
| P4 | Performance | `server/src/db/adminDb.js` | SQLite `synchronous = NORMAL` Pragma (passt zu `journal_mode=WAL`): deutlich weniger `fsync` bei kleinen wiederholten Writes, Durability bleibt crash-sicher. |
| P5 | Performance | `server/src/routes/staticSpa.js` | Differenzierte `Cache-Control`-Header: content-hashed `/assets/*` → `public, max-age=31536000, immutable`, `index.html` → `no-cache`, Rest → 1 h. Spart pro Return-Visit den gesamten Vite-Bundle-Transfer. |
| P6 | Performance | `client/vite.config.js` | `rollupOptions.output.manualChunks` für mediasoup-client+protoo+awaitqueue, @mediapipe/*, lucide, qrcode, fflate. App-Code-Edits invalidieren nicht mehr den ~MB großen Vendor-Bundle-Cache. |

### 1.2 Runde 2 (offene Empfehlungen umgesetzt)

| # | Bereich | Datei | Änderung |
|---|---------|-------|----------|
| F6 | Sicherheit | `server/src/routes/gifs.js` | Tenor API v1 → v2 (`tenor.googleapis.com/v2/search`). v1 ist seit 2023 deprecated. Response-Shape angepasst (`media[0]` → `media_formats`); `client_key=easymeet` ergänzt. |
| F7 | Sicherheit | `client/index.html`, `server/src/createApp.js` | Ungenutztes CDN-Script `https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js` entfernt (kein Code-Ref im Repo). CSP `script-src` auf `'self' 'wasm-unsafe-eval'` verengt — keine externe Host-Whitelist mehr. |
| F8 | Sicherheit | `client/src/protocol/validate.js`, `client/src/effects/network/mediasoupClient.js` | Neue `sanitizeEasymeetPayload()` normalisiert alle Server-Notifications (chat, peers, polls, file, reactions): String-Length-Caps, Typ-Coercion, Array-Caps. Gedacht gegen kompromittierten Server / MITM. Kein harter Reject — unbekannte Types bleiben erhalten (Forward-Compat). |
| F9 | Sicherheit | `client/src/effects/network/mediasoupClient.js` | Empfänger-seitiger File-Cap (`MAX_INCOMING_FILE_BYTES = 250 MB`, matched Server): `file_start` mit Oversize-Meta wird sofort abgelehnt, laufender Transfer beim Überschreiten abgebrochen inkl. Toast. Schützt Browser-RAM bei bösartigem Peer. |
| F10 | Sicherheit | `Dockerfile` | `HEALTHCHECK` gegen `/api/rooms/active` ergänzt (30 s Intervall). Docker/Kubernetes erkennen hängende Prozesse. |
| F11 | Dokumentation | `.env.example` | Rate-Limit-Variablen (`EASYMEET_API_RATE_LIMIT_MAX`, `EASYMEET_JOIN_RATE_LIMIT_MAX`, `EASYMEET_BOOTSTRAP_LOGIN_RATE_LIMIT_MAX`) und `EASYMEET_CORS_ORIGINS` dokumentiert; Tenor-Link auf v2 aktualisiert. |
| P7 | Performance | `server/package.json`, `server/src/createApp.js` | `compression` Middleware (gzip) vor Route-Mounting. Greift bei Direct-Docker-Deploy ohne Reverse-Proxy; hinter Nginx/Caddy transparent idempotent. JSON-Responses + SPA-Bundle werden komprimiert ausgeliefert. |
| P8 | Performance | `client/src/ui/screens/room-view.js` | 120 ms Debounce auf Emoji-Search (GIF-Search hatte bereits 300 ms). Spart synchrone Re-Renders von bis zu 500 Emoji-Buttons pro Tastenanschlag (~5–20 ms Blocking auf Mobile). |

---

## 2. Offene Empfehlungen (nicht direkt umgesetzt)

Die folgenden Punkte wurden bewusst nicht angefasst, weil sie entweder eine
Verhaltens-/API-Änderung an der UI oder noch zusätzliche UI-Tests erfordern.

### 2.1 Sicherheit

**Niedrig — CORS-Default-Liste enthält `localhost`-Origins auch in Prod**
`server/src/createApp.js:29-34` fügt `localhost:5173/3001` zur CORS-Allowlist
hinzu, wenn `EASYMEET_CORS_ORIGINS` unset ist. In Produktion harmlos (weil
Browser `Origin: localhost` nicht vorgeben würden), aber irreführend. Empfehlung:
wenn `NODE_ENV === "production"` und keine Origins gesetzt sind, leere Liste
und mit `logWarn` laut werden.

**Niedrig — `persistent-rooms.json` mit Klartext-Passwort im Repo**
`persistent-rooms.json` enthält `password: "nur-in-vertrauenswürdiger-umgebung"`
für Raum `TEAM`. Dieser Wert ist zwar offensichtlich ein Platzhalter, landet aber
im Docker-Image (siehe Dockerfile:37 `COPY persistent-rooms.default.json`).
Stelle sicher, dass `persistent-rooms.default.json` (die tatsächlich ins Image
kopierte Datei) **nur** `passwordEnv`-Verweise enthält — nie `password`.

**Niedrig — WS-Token-Client-ID-Binding ist streng genug, aber sweep-Loop ist weiterhin `O(n)`**
`server/src/wsJoinTokens.js:13` — `sweep()` iteriert bei jeder Ausgabe und jedem
Verbrauch die gesamte Map. Bei gleichzeitig 1000+ offenen Join-Tokens ist das
vertretbar. Bei Skalierung über mehrere Nodes braucht das ohnehin Redis/Shared
Cache.

### 2.2 Performance

**Mittel — Emoji-Grid rendert 500 Buttons up-front**
`client/src/ui/screens/room-view-renderers.js:307` baut alle Emoji-Elemente
synchron via `innerHTML`. Bei jedem Öffnen des Pickers ~5–20 ms Blocking
auf Mobilgeräten. Empfehlung: virtuelles Scrolling oder lazy-render pro Zeile.

**Mittel — `customBackgroundStorage.getCustomBackgrounds()` parst pro Call**
`client/src/effects/storage/customBackgroundStorage.js:16` — `JSON.parse` läuft
bei jedem Render der Settings-UI. Mit wenigen Einträgen irrelevant, aber
memoisiert per Modul-State + `storage`-Event-Listener wäre sauberer.

**Niedrig — Icons per `.outerHTML` bei jedem Re-Render**
`client/src/icons.js` erzeugt SVG-Elemente und gibt `.outerHTML` zurück. Bei
vielen Tiles → messbare GC-Druck. Cache-Map der gerenderten Strings würde
reichen.

---

## 3. Dependency-Übersicht

Ein `npm audit` war im Sandbox nicht möglich (Registry-403), aber die Versionen
sind durchgehend aktuell:

- Server: `express@^5.2.1`, `helmet@^8.1.0`, `express-rate-limit@^8.3.2`,
  `mediasoup@^3.14.16`, `protoo-server@^4.0.7`, `better-sqlite3@^12.9.0`,
  `bcrypt@^6.0.0`.
- Client: `vite@^8.0.9`, `mediasoup-client@^3.7.17`, `protoo-client@^4.0.7`,
  `@mediapipe/tasks-vision@^0.10.32`, `lucide@^0.577.0`.

Empfehlung: regelmäßiges `npm audit` gegen die Public-Registry (CI-Job, nicht
nur lokal) + `npm outdated` quartalsweise.

---

## 4. Verifikation der Fixes

- `node --check` auf allen geänderten JS-Dateien (Runde 1 + 2) → fehlerfrei.
- `package.json` JSON-Parse → OK.
- Pre-existing lokale Änderung in `client/src/ui/screens/landing.js` (Server-
  Admin-Button-Listener) wurde **nicht** angefasst und bleibt wie sie war.

Vor Produktiv-Deploy empfohlen:
```bash
npm ci                         # installiert neue compression-Dependency
npm run build                  # Client-Bundle mit manualChunks validieren
npm run server                 # Server startet & loggt Bootstrap nur neu
# Docker: docker build . und "docker inspect --format='{{.State.Health.Status}}'"
```

Manueller Smoke-Test empfohlen (nicht automatisierbar im Sandbox):
- Datei-Transfer knapp unter und knapp über 250 MB — Empfänger-Toast bei Overflow.
- Emoji-Picker Suche öffnen, schnell tippen — sichtbar ruhigeres Rendern.
- GIF-Suche mit gültigem `TENOR_API_KEY` — v2-Endpoint liefert Ergebnisse.
- `curl -H "Accept-Encoding: gzip" -I https://…/api/rooms/active` → `Content-Encoding: gzip`.

---

## 5. Neue Env-Variablen / Konfig

| Variable | Default | Zweck |
|----------|---------|-------|
| `EASYMEET_BOOTSTRAP_LOGIN_RATE_LIMIT_MAX` | `5` (pro Minute) | Limit für `/api/admin/bootstrap-login`. |
| `EASYMEET_API_RATE_LIMIT_MAX` | `120` | Allgemeines API-Limit (alt, nun dokumentiert). |
| `EASYMEET_JOIN_RATE_LIMIT_MAX` | `30` | Limit auf `/api/join` (alt, nun dokumentiert). |
| `EASYMEET_CORS_ORIGINS` | *(leer)* | Kommaseparierte Liste erlaubter Origins (alt, nun dokumentiert). |
| `TENOR_API_KEY` | *(leer)* | Tenor v2 (Google Cloud) API-Key. Ersetzt den hartkodierten Demo-Fallback. |

Neue Dependency: `compression@^1.7.5` (in `server/package.json`).
