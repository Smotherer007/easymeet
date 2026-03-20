# EasyMeet – Electron-Desktop

Schlanke **Electron-Hülle**: öffnet die EasyMeet-Web-App in einem `BrowserWindow` (WebRTC/mediasoup wie im Browser).

## Voraussetzungen

- Node.js **22+** empfohlen (gleich wie Server)
- Im Ordner `electron/`: `npm install`

## Start-URL

| Quelle | Beispiel |
|--------|-----------|
| **Standard** | `https://easymeet.easyroomtools.tech/` |
| **Umgebung** | `EASYMEET_URL=http://localhost:5173 npm start` |
| **CLI** | `npm start -- --easymeet-url=https://mein-host/` |

## Lokale Entwicklung

1. Im **Repo-Root**: `npm run dev:all` (Vite `:5173` + Server `:3001`)
2. Im Ordner **`electron/`**: `npm run start:dev`  
   → lädt `http://localhost:5173`

## Befehle (aus `electron/`)

```bash
npm start              # Demo-URL (oder EASYMEET_URL)
npm run start:dev      # localhost:5173
npm run pack           # Unpacked Build unter dist-pack/ (electron-builder --dir)
```

Vollständige Installer/DMG: `npx electron-builder` (ohne `--dir`) – siehe `package.json` → `build`.

## Hinweise

- **Kein** eingebettetes `dist/`: die App ist absichtlich nur ein **Client für eine URL** (einfachste Wartung, ein Build für Web + Desktop).
- Externe Links öffnen im **System-Browser**.
- Für eigene Server: HTTPS + gültiges Zertifikat empfohlen (WebRTC).
