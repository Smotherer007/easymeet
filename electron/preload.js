/**
 * Preload (contextIsolation): no IPC yet — placeholder for future native APIs.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('easymeetElectron', {
  platform: process.platform,
});
