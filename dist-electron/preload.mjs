"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("mc", {
  getSavedMinecraftDir: () => electron.ipcRenderer.invoke("mc:getSavedMinecraftDir"),
  pickMinecraftDir: () => electron.ipcRenderer.invoke("mc:pickMinecraftDir"),
  getProfiles: (dir) => electron.ipcRenderer.invoke("mc:getProfiles", dir)
});
