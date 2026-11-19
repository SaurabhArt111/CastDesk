'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

// The only surface the web UI can reach. Every call is validated again in the main process.
contextBridge.exposeInMainWorld('paneo', {
  platform: process.platform,
  // the sandboxed preload has no access to the os module, so the main process answers this
  hostname: ipcRenderer.sendSync('app:hostname'),
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => on('state', cb),
  getPeers: () => ipcRenderer.invoke('peers:get'),
  onPeers: (cb) => on('peers', cb),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  rotatePin: () => ipcRenderer.invoke('pin:rotate'),
  refreshScan: () => ipcRenderer.invoke('scan:refresh'),
  revoke: (id) => ipcRenderer.invoke('trusted:revoke', id),
  setPermissions: (id, perms) => ipcRenderer.invoke('trusted:perms', id, perms),
  disconnectClient: (id) => ipcRenderer.invoke('client:disconnect', id),
  applyLayout: (items) => ipcRenderer.invoke('layout:apply', items),
  getPermissions: () => ipcRenderer.invoke('permissions:get'),
  fixPermission: (id) => ipcRenderer.invoke('permissions:fix', id),
  prepareCapture: (displayId) => ipcRenderer.invoke('capture:prepare', displayId),
  moveToDisplay: (index) => ipcRenderer.invoke('window:moveToDisplay', index),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
});
