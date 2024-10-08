const { contextBridge, ipcRenderer } = require('electron/renderer')
const { app } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanProviders: (...args) => ipcRenderer.invoke('providers:scan', ...args),
  onSstMessage: (callback) => ipcRenderer.on('sst:message', (_event, value) => callback(value)),
  sendMessagetoSst: (value) => ipcRenderer.send('sst:sendmessage', value),
  sst: (...args) => ipcRenderer.invoke('provider:sst', ...args),
  network: () => ipcRenderer.invoke('network'),
  yagnaAddress: () => ipcRenderer.invoke('yagnaAddress'),
  debug: () => ipcRenderer.invoke('debug')
})