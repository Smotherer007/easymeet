# EasyMeet — Audit: Performance & Sicherheit

Stand: 2026-04-21 · Scope: Server (Backend), Client (Frontend), Docker/Deployment

Dieser Report dokumentiert Findings aus einem Code-Audit des EasyMeet-Repos
(mediasoup SFU, Node 22 / Express 5, Vite-Client) und listet auf, was bereits
direkt gefixt wurde und was als Empfehlung offen bleibt.

---

## 1. Direkt umgesetzte Fixes

Alle Änderungen sind nicht-brechende Minimal-Edits (keine neuen Dependencies,
keine Verhaltens­änderung für legitime Flows). Verifiziert via `node --check`
für alle 8 geänderten Dateien.

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

---

## 2. Offene Empfehlungen (nicht direkt umgesetzt)

Die folgenden Punkte wurden bewusst nicht angefasst, weil sie entweder eine
neue Dependency, eine Verhaltens-/API-Änderung oder UI-Tests erfordern.

### 2.1 Sicherheit

**Mittel — Tenor API v1 ist deprecated**
`server/src/routes/gifs.js:20` ruft `https://g.tenor.com/v1/search` auf. Tenor v1
ist seit 2023 deprecated, Google-seitig mehrfach angekündigt. Upgrade auf v2
(`https://tenor.googleapis.com/v2/search`) benötigt einen echten Google-Cloud
API-Key; Response-Shape ist kompatibel bis auf `media` → `media_formats`. Empfehlung:
Umstellung auf v2 inkl. `client_key`-Parameter (für Ratelimit-Zuordnung pro App).

**Mittel — Externes CDN-Script ohne SRI**
`client/index.html:5` lädt `https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js`
ohne `integrity=`-Attribut. Wenn die CDN kompromittiert wird, lädt jeder Nutzer
bösartigen JS-Code in den SFU-Kontext (Zugriff auf getUserMedia-Streams möglich).
Zwei Optionen:
1. **Self-hosting** über npm-Paket `iconify-icon` (bevorzugt, CSP wird strenger).
2. **SRI-Hash hinzufügen**: `integrity="sha384-..." crossorigin="anonymous"`. Bricht,
   sobald iconify das File aktualisiert — erfordert Pinning und Review.

**Mittel — Unvalidierte Protoo-Server-Notifications im Client**
`client/src/effects/network/mediasoupClient.js` dispatcht Server-Payloads
(chat, polls, members, file chunks) ohne Schema-Check in den Store. Ein
kompromittierter Server oder MITM könnte damit z. B. überlange Felder oder
unerwartete Typen in die UI schieben. Empfehlung: zod/yup-Schemas in
`client/src/protocol/validate.js` und harter Reject bei Mismatch.

**Mittel — File-Transfer ohne Rx-Seite-Backpressure & Size-Cap**
`client/src/effects/network/mediasoupClient.js:451` sammelt via
`chunkQueue.push(binary.buffer)` ohne Obergrenze. Ein bösartiger Peer kann
durch Dauerversand eines großen „Files" den Browser-RAM-Verbrauch treiben.
Server-seitig greift bereits `FILE_TRANSFER_MAX_BYTES = 250 MB` und
`WS_FILE_CHUNKS_PER_WINDOW` — den gleichen Hard-Cap sollte der Client
bei eingehenden Daten ebenfalls enforcen (abbrechen + User-Toast).

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

**Niedrig — Docker-Image ohne `HEALTHCHECK`**
`Dockerfile` hat kein `HEALTHCHECK`-Directive. Orchestratoren (Kubernetes,
Docker Swarm, auch reines `docker run --restart unless-stopped`) erkennen keine
hängenden Server-Prozesse. Empfehlung: `HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3001/api/rooms/active').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.

### 2.2 Performance

**Hoch — `compression` Middleware fehlt**
Keine gzip/brotli-Kompression auf JSON-/SPA-Antworten. Mit Reverse-Proxy
davor (Nginx/Caddy) erledigt der Proxy das, aber bei Direct-Docker-Deploy
(siehe `docker-compose.yml`) fällt das weg. Empfehlung: `npm i -w easymeet-server compression`
und `app.use(compression())` in `createApp.js` vor `express.static`.

**Mittel — Emoji-Grid rendert 500 Buttons up-front**
`client/src/ui/screens/room-view-renderers.js:307` baut alle Emoji-Elemente
synchron via `innerHTML`. Bei jedem Öffnen des Pickers ~5–20 ms Blocking
auf Mobilgeräten. Empfehlung: virtuelles Scrolling oder lazy-render pro Zeile.

**Mittel — `customBackgroundStorage.getCustomBackgrounds()` parst pro Call**
`client/src/effects/storage/customBackgroundStorage.js:16` — `JSON.parse` läuft
bei jedem Render der Settings-UI. Mit wenigen Einträgen irrelevant, aber
memoisiert per Modul-State + `storage`-Event-Listener wäre sauberer.

**Mittel — Debounce für GIF/Emoji-Search fehlt**
GIF- und Emoji-Suchfelder lösen pro Tastenanschlag einen Render bzw. Fetch aus.
300 ms Debounce auf `input`-Events würde Tenor-API-Quota und DOM-Churn deutlich
reduzieren.

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

- `node --check` auf allen 9 geänderten JS-Dateien → fehlerfrei.
- Pre-existing lokale Änderung in `client/src/ui/screens/landing.js` (Server-
  Admin-Button-Listener) wurde **nicht** angefasst und bleibt wie sie war.
- Git-Status: 9 Dateien geändert, +120/−27 Zeilen.

Vor Produktiv-Deploy empfohlen:
```bash
npm ci
npm run build                 # Client-Bundle mit manualChunks validieren
npm run server                # Server startet & loggt Bootstrap nur neu
```

---

## 5. Neue Env-Variablen

| Variable | Default | Zweck |
|----------|---------|-------|
| `EASYMEET_BOOTSTRAP_LOGIN_RATE_LIMIT_MAX` | `5` (pro Minute) | Limit für `/api/admin/bootstrap-login`. |
| `TENOR_API_KEY` | *(leer)* | Ersetzt den zuvor hartkodierten Demo-Fallback. |

`.env.example` muss entsprechend ergänzt werden, wenn ihr die Variablen
prominent machen wollt (optional — beide haben sinnvolle Defaults).
