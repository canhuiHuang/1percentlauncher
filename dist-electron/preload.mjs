"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("mc", {
  getDefaultDir: () => electron.ipcRenderer.invoke("mc:getDefaultDir"),
  getProfiles: (dir) => electron.ipcRenderer.invoke("mc:getProfiles", dir)
});
