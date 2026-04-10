import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mc", {
  getDefaultDir: () => ipcRenderer.invoke("mc:getDefaultDir"),
  getProfiles: (dir: string) => ipcRenderer.invoke("mc:getProfiles", dir),
});
