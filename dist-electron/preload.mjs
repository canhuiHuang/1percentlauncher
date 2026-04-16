"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("mc", {
  getSavedMinecraftDir: () => electron.ipcRenderer.invoke("mc:getSavedMinecraftDir"),
  pickMinecraftDir: () => electron.ipcRenderer.invoke("mc:pickMinecraftDir"),
  getProfiles: (dir) => electron.ipcRenderer.invoke("mc:getProfiles", dir),
  installForgeFromDropbox: (dir) => electron.ipcRenderer.invoke("mc:installForgeFromDropbox", dir),
  onForgeInstallProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    electron.ipcRenderer.on("mc:forgeInstallProgress", listener);
    return () => {
      electron.ipcRenderer.removeListener("mc:forgeInstallProgress", listener);
    };
  }
});
