import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mc", {
  getSavedMinecraftDir: () => ipcRenderer.invoke("mc:getSavedMinecraftDir"),
  pickMinecraftDir: () => ipcRenderer.invoke("mc:pickMinecraftDir"),
  getProfiles: (dir: string) => ipcRenderer.invoke("mc:getProfiles", dir),
  installForgeClean: (dir: string) =>
    ipcRenderer.invoke("mc:installForgeClean", dir),
  installForgeIntoProfile: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:installForgeIntoProfile", dir, profileId),

  // Independent forge
  onForgeInstallProgress: (
    callback: (payload: {
      stage: "searching" | "downloading" | "installing" | "done" | "error";
      percent: number;
      message: string;
    }) => void
  ) => {
    const listener = (
      _event: unknown,
      payload: {
        stage: "searching" | "downloading" | "installing" | "done" | "error";
        percent: number;
        message: string;
      }
    ) => callback(payload);

    ipcRenderer.on("mc:forgeInstallProgress", listener);

    return () => {
      ipcRenderer.removeListener("mc:forgeInstallProgress", listener);
    };
  },
});
