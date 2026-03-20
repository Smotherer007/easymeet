const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easymeetSettings', {
  getSavedUrl: () => ipcRenderer.invoke('easymeet-settings:get-saved-url'),
  getDefaultUrl: () => ipcRenderer.invoke('easymeet-settings:get-default-url'),
  saveUrl: (url) => ipcRenderer.invoke('easymeet-settings:save-url', url),
  close: () => ipcRenderer.send('easymeet-settings:close'),
});
