import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mc", {
  getAppConfig: () => ipcRenderer.invoke("mc:getAppConfig"),
  dismissOnboarding: () => ipcRenderer.invoke("mc:dismissOnboarding"),
  getSavedMinecraftDir: () => ipcRenderer.invoke("mc:getSavedMinecraftDir"),
  setWindowContentSize: (width: number, height: number) =>
    ipcRenderer.invoke("mc:setWindowContentSize", width, height),
  getSystemMemoryMb: () => ipcRenderer.invoke("mc:getSystemMemoryMb"),
  pickMinecraftDir: () => ipcRenderer.invoke("mc:pickMinecraftDir"),
  getProfiles: (dir: string) => ipcRenderer.invoke("mc:getProfiles", dir),
  profileHasServerIp: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:profileHasServerIp", dir, profileId),
  openProfileFolder: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:openProfileFolder", dir, profileId),
  updateProfileRamMb: (dir: string, profileId: string, ramMb: number) =>
    ipcRenderer.invoke("mc:updateProfileRamMb", dir, profileId, ramMb),
  launchSelectedProfile: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:launchSelectedProfile", dir, profileId),
  updateProfileName: (dir: string, profileId: string, profileName: string) =>
    ipcRenderer.invoke("mc:updateProfileName", dir, profileId, profileName),
  getRequiredForgeInfo: () => ipcRenderer.invoke("mc:getRequiredForgeInfo"),
  getServerMods: () => ipcRenderer.invoke("mc:getServerMods"),
  getInstalledMods: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:getInstalledMods", dir, profileId),
  installForgeClean: (dir: string) =>
    ipcRenderer.invoke("mc:installForgeClean", dir),
  installForgeIntoProfile: (dir: string, profileId: string) =>
    ipcRenderer.invoke("mc:installForgeIntoProfile", dir, profileId),
  updateSelectedProfile: (
    dir: string,
    profileId: string,
    removeUnusedMods?: boolean
  ) => ipcRenderer.invoke("mc:updateSelectedProfile", dir, profileId, removeUnusedMods),

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
