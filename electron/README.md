# EasyMeet – Electron-Desktop

Schlanke **Electron-Hülle**: öffnet die EasyMeet-Web-App in einem `BrowserWindow` (WebRTC/mediasoup wie im Browser).

## Voraussetzungen

- Node.js **22+** empfohlen (gleich wie Server)
- Im Ordner `electron/`: `npm install`

## Start-URL

| Priorität | Quelle | Beispiel |
|-----------|--------|----------|
| 1 | **CLI** | `npm start -- --easymeet-url=https://mein-host/` |
| 2 | **Umgebung** | `EASYMEET_URL=http://localhost:5173 npm start` |
| 3 | **Gespeichert** | Menü **Server-Adresse…** (wird in der User-Daten persistiert) |
| 4 | **Standard** | `https://easymeet.easyroomtools.tech/` |

Die gespeicherte URL liegt unter **`app.getPath('userData')/easymeet-electron-config.json`** (z. B. macOS: `~/Library/Application Support/easymeet-electron/`).

## Server-Adresse in der App

- **macOS:** Menü **EasyMeet → Server-Adresse…**
- **Windows / Linux:** Menü **Datei → Server-Adresse…**

Eingabe speichern lädt die Hauptfenster-URL sofort neu. Feld **leer** speichern → Eintrag entfernt, es gilt wieder der Standard (sofern keine CLI/Env-URL gesetzt ist).

## Lokale Entwicklung

1. Im **Repo-Root**: `npm run dev:all` (Vite `:5173` + Server `:3001`)
2. Im Ordner **`electron/`**: `npm run start:dev`  
   → lädt `http://localhost:5173`

## Befehle (aus `electron/`)

```bash
npm start              # URL wie oben (Priorität)
npm run start:dev      # localhost:5173 (CLI-Override)
npm run pack           # Unpacked Build unter dist-pack/ (electron-builder --dir)
```

Vollständige Installer/DMG: `npx electron-builder` (ohne `--dir`) – siehe `package.json` → `build`.

## Icon

- **`assets/icon.png`** – Fenster- und Builder-Icon (an EasyMeet-Branding angelehnt).
- **`assets/favicon.svg`** – Kopie des Web-`favicon.svg` (Referenz / ggf. für spätere Pipelines).

## Hinweise

- **Kein** eingebettetes `dist/`: die App ist absichtlich nur ein **Client für eine URL** (einfachste Wartung, ein Build für Web + Desktop).
- Externe Links öffnen im **System-Browser**.
- Für eigene Server: HTTPS + gültiges Zertifikat empfohlen (WebRTC).
