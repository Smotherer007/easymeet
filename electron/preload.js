/**
 * Preload (contextIsolation): aktuell ohne IPC – Platzhalter für spätere Native-APIs.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('easymeetElectron', {
  platform: process.platform,
});
